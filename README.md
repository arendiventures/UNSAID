# UNSAID Studio

Private production application for **UNSAID - What the world wants to know**: a human-hosted podcast featuring
deeply researched, clearly labeled AI simulations of public figures.

> Everything a simulated guest says is generated dialogue from a labeled AI simulation. It is grounded in a
> research collection you curate, validated against that collection before it can be spoken, and never
> presented as testimony, confession, recovered memory or access to private thoughts.

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill in ANTHROPIC_API_KEY when you have one; everything else is optional
pnpm db:migrate                   # creates ./storage/db/unsaid.sqlite and applies migrations
pnpm db:seed                      # draft guest profiles (no research attached)
pnpm dev                          # http://127.0.0.1:3000
```

Optional: register brand/guest images into private storage (they are git-ignored):

```bash
pnpm assets:import brand_logo ./path/unsaid-logo.png --label "UNSAID wordmark"
pnpm assets:import studio_backdrop ./path/studio.png
pnpm assets:import guest_concept_image ./path/maxwell-concept.png --guest ghislaine-maxwell
pnpm assets:import episode_thumbnail ./path/maxwell-thumb.png --guest ghislaine-maxwell
```

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest, synthetic fixtures only). Production: `pnpm build && pnpm start`.

## Architecture (short)

```
Host question (typed; voice in Milestone 2)
   │
   ▼
POST /api/episodes/:id/turns  ──►  runTurn()  src/lib/engine/run.ts
                                     │ retrieving   FTS5/BM25 over the episode's research snapshot
                                     │ generating   LLM adapter (Anthropic Claude, structured output)
                                     │ validating   citations ⊆ retrieved ids, policy flags
                                     ▼
                                   turn row: ready | needs_review | failed | interrupted
   │                                           │
   ▼                                           ▼
Studio transcript + producer panel     /api/episodes/:id/public → /capture/:id (OBS)
(citations, flags, usage)              (guest text + branding + AI SIMULATION label only)
```

- **Next.js 16 / React 19 / TypeScript**, Tailwind v4, self-hosted fonts.
- **SQLite (better-sqlite3) + Drizzle** with SQL migrations in `drizzle/`; portable schema, documented path to
  PostgreSQL in `CLAUDE.md`.
- **Research**: text / markdown / text-based PDF uploads and manually pasted excerpts with source links. Documents
  are split into passages with stable ids (`psg_<source>_<seq>`), exact duplicates are collapsed in retrieval but
  kept on disk, conflicting accounts are preserved. Search is **lexical** (SQLite FTS5 + BM25) - not semantic.
  Scanned PDFs are stored and marked **OCR required** (OCR is not implemented).
- **Conversation engine**: behavior (profile, ledger, performance directions) is separated from evidence
  (retrieved passages). Output is a structured response (`spoken_text` + producer metadata) validated before
  playback. Validation adds milliseconds, not a model call, and is never skipped; latency optimisation later must
  keep it in the path.
- **Providers**: replaceable adapters for LLM / STT / TTS / avatar (`src/lib/providers/types.ts`). Implemented:
  Anthropic Claude (Messages API, structured output, prompt caching, cancellation, usage metrics), an **offline
  evidence reader** that only reads retrieved excerpts aloud so the loop can be exercised without credentials, and
  **ElevenLabs** for both speech-to-text (Scribe, push-to-talk clips) and text-to-speech (stock voices, MP3 stored
  once per turn). Avatar: not implemented.
- **Speech loop** (Milestone 2): hold the talk button (or Space) → clip is uploaded on release → transcribed →
  asked → validated → synthesized → played through one audio element in the studio. Synthesis is tracked in the
  `jobs` table with an idempotency key per turn, so a turn is never paid for twice; stored audio is replayable and
  listed as an asset on the episode. Cloned/celebrity voices are refused unless the guest profile records a custom
  voice with verified consent.
- **Storage**: `./storage` (git-ignored) holds the database, uploaded research, brand/guest assets and future
  media. Files are served only through authenticated route handlers.
- **Access**: binds to 127.0.0.1. Without `STUDIO_ACCESS_TOKEN` only loopback requests are served; with it, every
  page and API route requires login at `/login`.

## Environment variables

See `.env.example`. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for the simulation | Claude via the official SDK. Without it the studio runs in offline evidence-reader mode. |
| `UNSAID_LLM_MODEL` | no | default `claude-opus-5-5` |
| `UNSAID_LLM_EFFORT` | no | `low` (default) / `medium` / `high` |
| `STUDIO_ACCESS_TOKEN` | before network exposure | enables login; without it the app refuses non-loopback requests |
| `UNSAID_STORAGE_DIR` | no | default `./storage` |
| `UNSAID_MAX_UPLOAD_MB` | no | default 25 |
| `ELEVENLABS_API_KEY` | for live audio mode | enables push-to-talk transcription and spoken answers |
| `UNSAID_STT_MODEL` / `UNSAID_TTS_MODEL` | no | defaults `scribe_v2` / `eleven_multilingual_v2` |
| `UNSAID_ELEVENLABS_VOICE_ID` | no | fallback stock voice when a guest has none selected |
| `TAVUS_API_KEY`, `HEYGEN_API_KEY` | no | reserved for Milestone 3; no adapter reads them yet |

## What was actually tested

- `pnpm test`: 33 unit/integration tests (chunking, FTS query hardening, ingestion incl. PDF text vs scanned
  detection, duplicate collapse, conflicting accounts preserved, injection text stored as data, citation
  validation and all blocking flags, prompt delimiter neutralisation, offline reader, exports, ElevenLabs
  request shaping against a stubbed transport, speak-once idempotency and voice-consent refusal).
- End-to-end over HTTP against `pnpm dev` with a synthetic guest: profile create/patch/version bump, ledger entry,
  manual record + markdown upload, unsupported-type rejection (415), search → passage id → same excerpt, episode
  gating (409 before start / after end), two validated turns with real citations, mark-for-review, audience
  projection containing no question/citation/producer/provider fields, markdown/json/review exports containing
  the actual conversation, stop/end, provider status + connection test reporting the exact missing variable,
  guest-with-episodes delete refusal.
- Production build (`next build`, standalone output) and a boot of the standalone bundle with a fresh storage
  directory and an access token: migrations ran, the login gate issued and enforced the session cookie.
- Headless Chromium pass over every screen (overview, guests, guest editor, research + search, source browser,
  episodes, episode detail, settings, assets, studio: start session → ask → answer rendered with citations →
  mark for review → microphone meter with a fake device, capture view, login) with console/page error capture.
- Data persistence across a server restart.

## Not tested / blocked in this environment

- **Anthropic Claude**: adapter written against the current SDK (`@anthropic-ai/sdk` 0.133) and typechecked, but
  this build environment had no `ANTHROPIC_API_KEY`, so no real generation or connection test succeeded. Set the
  key, open Settings → "Test connection", then run a rehearsal.
- **ElevenLabs speech**: adapters are written against the official `@elevenlabs/elevenlabs-js` 2.71 SDK and
  verified against a stubbed transport (request paths, fields, headers, error mapping). The live API host was
  blocked from this build environment, so **no real transcription or synthesis has run yet**. With a key set,
  open Settings → "Test connection" on both speech rows, pick a stock voice on the guest profile, start a
  "Live audio interview" session and hold the talk button. Hands-free turn detection is not implemented (push-to-talk
  only, by design for reliability).
- **Live avatar**: not implemented (Milestone 3). Tavus and HeyGen hosts were blocked from this environment.
- **OCR** for scanned PDFs: not implemented; such files are stored and flagged.

## Using it from a phone

The app runs on a computer (or a server); the phone just opens it in the browser. Phone browsers only allow the
microphone on HTTPS pages, so push-to-talk needs a secure address.

**Own computer + Tailscale (free, no code changes).** Install Tailscale on the computer and the phone, set
`STUDIO_ACCESS_TOKEN` in `.env.local`, then:

```bash
pnpm dev:lan             # listens on all interfaces instead of 127.0.0.1
tailscale serve 3000     # prints an https://… address reachable from the phone
```

Open that address on the phone, enter the token, and use **/remote** - the phone-sized host remote (big talk
button, transcript, stop, end). Research, profiles and OBS stay on the desktop studio.

**Hosted (always on).** The `Dockerfile` builds a self-contained image. On Railway, Fly.io or Render: deploy from
this repo, mount a persistent volume at `/data`, and set `STUDIO_ACCESS_TOKEN`, `ANTHROPIC_API_KEY` and
`ELEVENLABS_API_KEY` in the host's environment settings. The container refuses requests until the token is set.
Migrations run on first start; create guests from the Guests screen (the seed script is a dev-only helper).

## Recording the first rehearsal with OBS

1. Start the app and open the Interview Studio. Pick the guest, name the episode, click **Start session**.
2. Click **Open OBS capture view**; it opens `/capture/<episodeId>` in a new window. It shows only the guest
   visual (static concept image or studio backdrop), the UNSAID logo, the **AI SIMULATION** label and captions.
   Add `?captions=0` to hide captions. Do not add `?audio=1` unless you want *that* window to play browser
   voice; keep playback in one place to avoid doubled audio.
3. In OBS add a **Window Capture** (or **Browser** source pointing at the capture URL, 1920x1080). Add your
   host camera and microphone as usual. Wear headphones.
4. Ask questions from the studio window: typed, or hold the talk button in a live audio session. Validated answers
   appear in the capture view a second later; held-for-review answers never do. Guest audio plays in the studio
   window by default; add `?audio=guest` to the capture URL only if you want OBS to capture the audio from that
   window instead, and then turn off "Guest voice" in the studio to avoid doubled playback.
5. Record in OBS. The transcript, evidence map and review flags are saved independently in the database; if the
   recording fails nothing is lost. Export from **Episodes** (transcript, transcript + evidence, JSON, review
   notes).

## Repository

`storage/`, `.env.local`, `node_modules/` and `.next/` are git-ignored. Nothing is pushed or published by the
app itself.
