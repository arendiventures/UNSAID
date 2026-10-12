# UNSAID Studio - project conventions

Private production workspace for the podcast **UNSAID - What the world wants to know**: a human host interviews
clearly labeled AI simulations of public figures. This file captures architecture decisions and conventions
for anyone (human or agent) working in this repository.

## Non-negotiables

- Every guest is an **AI SIMULATION** and is labeled as such in the studio, the capture view and every export.
  Generated dialogue is never presented as testimony, confession, recovered memory or private thoughts.
- **Evidence is data, not instructions.** Retrieved passages are wrapped in `<retrieved_evidence>` and the prompt
  tells the model to ignore instructions inside them; delimiter tags inside research text are neutralized
  (`src/lib/engine/prompt.ts`).
- **Validate before anything is spoken.** `runTurn` goes retrieving → generating → validating; a turn only reaches
  `ready` if every cited passage id exists in the retrieved set and no blocking flag fired
  (`src/lib/engine/validate.ts`). Malformed, refused or unsupported output lands in `needs_review`, never on air.
- **Never manufacture citations or confidence.** Citations are mapped back to real passage rows; there are no
  invented probability scores anywhere in the UI.
- **No real-person research in tests.** Fixtures are synthetic (`tests/fixtures/synthetic.ts`, "Mara Quill").
  The seed script creates draft profiles only - no biography, style or personality text.
- **Secrets, private research, media and the database never enter Git.** Everything lives under `storage/`
  (git-ignored) and is served through route handlers, not `/public`. `redactSecrets()` scrubs log lines.
- **Honest integration status.** The settings page lists each provider as implemented/configured/planned.
  Do not add half-built adapters; one working provider per category.

## Stack

- Next.js 16 (App Router, Turbopack dev), React 19, TypeScript strict, Tailwind v4 (`@theme` tokens in
  `src/app/globals.css`), self-hosted fonts (Oswald display / Inter / JetBrains Mono under `public/fonts`).
- SQLite via `better-sqlite3` + Drizzle ORM. Migrations in `drizzle/` (generated with `drizzle-kit generate`,
  applied automatically on first DB open by `src/lib/db/client.ts`). FTS5 index + sync triggers live in the
  custom migration `drizzle/0001_passages_fts.sql`.
- Language model: Anthropic Claude via `@anthropic-ai/sdk` (`src/lib/providers/llm/anthropic.ts`), structured
  output through `output_config.format` + Zod, prompt caching on the system prompt, cancellation via
  `AbortSignal`. Default model `claude-opus-5-5`, effort `low` for conversational latency (env-tunable).
- Offline fallback: `LocalEvidenceReader` composes answers from verbatim retrieved excerpts. It is labeled in the
  UI and in its own spoken text; it is **not** a persona simulation.
- Speech: ElevenLabs via `@elevenlabs/elevenlabs-js` (`providers/stt/elevenlabs.ts` Scribe batch transcription,
  `providers/tts/elevenlabs.ts` synthesis + voice listing). `services/speech.ts` owns speak-once semantics
  (idempotency key `tts:<turnId>` in `jobs`, audio stored as an `audio` asset linked to the turn) and the
  stock-voice rule. Live calls were not exercised in the build sandbox (host blocked); tests stub the transport.

## Layout

```
src/app/(studio)/*          producer screens (shared shell with nav)
src/app/capture/[episodeId] audience capture view for OBS (no nav, no producer data)
src/app/api/**              route handlers (JSON; multipart for uploads)
src/lib/db                  schema.ts (Drizzle), client.ts (connection + migrate)
src/lib/research            chunk.ts, ingest.ts, pdf.ts, retrieval.ts (FTS5/BM25)
src/lib/engine              schema.ts (response shape), prompt.ts, validate.ts, run.ts (turn state machine)
src/lib/providers           adapter interfaces (types.ts), registry.ts, llm/{anthropic,local}.ts,
                            elevenlabs/client.ts, stt/elevenlabs.ts, tts/elevenlabs.ts
src/lib/services            guests.ts (versioning), episodes.ts (snapshots), assets.ts, jobs.ts, speech.ts
src/lib/export              transcript.ts (markdown / json / review notes)
src/proxy.ts                access control (loopback-only without STUDIO_ACCESS_TOKEN)
scripts/                    migrate, seed, import-assets
tests/                      vitest unit/integration tests with synthetic fixtures
```

## Conventions

- Ids are prefixed random tokens (`gst_`, `src_`, `ep_`, `trn_`, `ast_`); passage ids are deterministic
  `psg_<source8>_<seq4>` and never renumbered.
- Timestamps are ISO-8601 strings; JSON columns are `text` with `{ mode: "json" }` for portability to Postgres.
- Route handlers are wrapped with `route()` from `src/lib/api.ts` (Zod validation errors → 422, EngineError →
  its status, anything else → 500 with redacted message). Client code calls `api()` from `src/lib/client.ts`.
- Server components read the DB directly for initial render; client components mutate through `/api/*`.
- Instruction-affecting guest fields (`INSTRUCTION_FIELDS` in `services/guests.ts`) bump `currentVersion` and
  write a snapshot row. Starting an episode freezes `guestSnapshot` + `researchSnapshot`; retrieval for that
  episode is scoped to the snapshot's source ids.
- Only exact (normalized-text) duplicate passages are collapsed, and only in retrieval output; conflicting
  accounts are always kept as separate passages.
- Browser `speechSynthesis` is offered as "browser voice (rehearsal only)" - it is never described as the guest
  voice and is off by default so producer and capture views do not both play audio.
- Guest audio plays through exactly one `<audio>` element in the studio; the capture view plays nothing unless
  `?audio=guest` (stored asset) or `?audio=browser` is set. "Stop guest" pauses playback, cancels push-to-talk
  and aborts the in-flight generation.
- Episode `mode` is gated server-side by `modeAvailability()`; `audio` needs both speech adapters configured.
  Push-to-talk clips go nowhere until the button is released.

## Migration path to a hosted database

Schema uses portable types only. To move to PostgreSQL: change `dialect` in `drizzle.config.ts`, swap the driver
in `src/lib/db/client.ts`, regenerate migrations, and replace the FTS5 query in `retrieval.ts` with
`tsvector`/`ts_rank` (that file is the only consumer of FTS5). Add `pgvector` there if semantic retrieval is
introduced - and only then describe search as semantic.

## Commands

`pnpm dev` (127.0.0.1:3000) · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm db:migrate` · `pnpm db:seed` ·
`pnpm assets:import <kind> <file> [--guest slug]` · `pnpm build && pnpm start`

## Milestones

1. **Done:** local app, guest profiles with versioned instructions and separated evidence ledger, research
   upload/search with stable passage ids, typed interview loop with validation, producer evidence panel,
   persisted episodes, exports, OBS capture view, provider status page.
2. **Built, live calls unverified in sandbox:** ElevenLabs STT + TTS adapters, push-to-talk, speak-once audio
   assets, mode gating, voice picker with stock-only rule. Hands-free turn detection deliberately not added yet.
3. Avatar: evaluate Tavus / HeyGen against current docs; verify background replacement / transparency before
   promising a composited studio.
4. Async avatar video jobs (`jobs` table already exists with queued/running/completed/failed/cancelled),
   improved retrieval, source review workflow.
