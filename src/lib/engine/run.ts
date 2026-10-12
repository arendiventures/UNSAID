import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { episodes, guests, turns, type AnswerLength, type Episode, type GuestEntry, type Turn } from "@/lib/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { searchPassages, type RetrievedPassage } from "@/lib/research/retrieval";
import { getLlm } from "@/lib/providers/registry";
import { buildHistory, buildSystemPrompt, buildTurnMessage, LENGTH_GUIDE, type GuestProfileForPrompt } from "./prompt";
import { failedRecord, validateResponse } from "./validate";

export class EngineError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

type SnapshotShape = GuestProfileForPrompt & { entries?: GuestEntry[]; displayName: string };

// In-flight generations, keyed by turn id. Survives dev hot reloads via globalThis.
const inflight = ((globalThis as unknown as { __unsaidInflight?: Map<string, AbortController> }).__unsaidInflight ??= new Map<string, AbortController>());
(globalThis as unknown as { __unsaidInflight?: Map<string, AbortController> }).__unsaidInflight = inflight;

const ACTIVE_STATES = ["queued", "retrieving", "generating", "validating"] as const;

export function cancelTurn(turnId: string): boolean {
  const ctrl = inflight.get(turnId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

export function cancelEpisodeTurns(episodeId: string): number {
  const db = getDb();
  const active = db
    .select({ id: turns.id })
    .from(turns)
    .where(and(eq(turns.episodeId, episodeId), inArray(turns.state, [...ACTIVE_STATES])))
    .all();
  let n = 0;
  for (const t of active) if (cancelTurn(t.id)) n++;
  return n;
}

export type RunTurnInput = { episodeId: string; question: string; inputMode?: "typed" | "voice"; llmId?: string | null; transcriptMeta?: Record<string, unknown> | null };

/**
 * One host question through the loop:
 * queued -> retrieving -> generating -> validating -> ready | needs_review | failed | interrupted.
 * Validation happens before anything is spoken. That costs one extra pass over the
 * structured response (milliseconds, no extra model call) but means an unvalidated
 * answer can never reach the audience view.
 */
export async function runTurn(input: RunTurnInput): Promise<Turn> {
  const db = getDb();
  const sqlite = getSqlite();
  const question = input.question.trim();
  if (!question) throw new EngineError("Question is empty.");
  if (question.length > 4000) throw new EngineError("Question is too long (4000 characters max).");

  const episode = db.select().from(episodes).where(eq(episodes.id, input.episodeId)).get();
  if (!episode) throw new EngineError("Episode not found.", 404);
  if (episode.status === "ended") throw new EngineError("This episode has ended. Start a new session to continue.", 409);
  if (episode.status !== "live") throw new EngineError("Start the session before asking questions.", 409);

  const active = db
    .select({ id: turns.id })
    .from(turns)
    .where(and(eq(turns.episodeId, episode.id), inArray(turns.state, [...ACTIVE_STATES])))
    .get();
  if (active) throw new EngineError("A response is already being generated for this episode. Stop it or wait for it to finish.", 409);

  const guest = db.select().from(guests).where(eq(guests.id, episode.guestId)).get();
  if (!guest) throw new EngineError("Guest profile is missing.", 404);

  const snapshot = (episode.guestSnapshot ?? {}) as unknown as SnapshotShape;
  const profile: GuestProfileForPrompt = {
    displayName: snapshot.displayName ?? guest.displayName,
    simulationLabel: snapshot.simulationLabel ?? guest.simulationLabel,
    bioSummary: snapshot.bioSummary ?? guest.bioSummary,
    knowledgeCutoff: snapshot.knowledgeCutoff ?? guest.knowledgeCutoff,
    perspective: snapshot.perspective ?? guest.perspective,
    perspectiveNotes: snapshot.perspectiveNotes ?? guest.perspectiveNotes,
    speakingStyle: snapshot.speakingStyle ?? guest.speakingStyle,
    personalityInterpretations: snapshot.personalityInterpretations ?? guest.personalityInterpretations,
    answerLength: snapshot.answerLength ?? guest.answerLength,
  };
  const entries: GuestEntry[] = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const answerLength: AnswerLength = episode.answerLength ?? profile.answerLength;

  const prior = db.select().from(turns).where(eq(turns.episodeId, episode.id)).orderBy(asc(turns.seq)).all();
  const seq = (prior[prior.length - 1]?.seq ?? 0) + 1;
  const turnId = newId("trn");
  const now = nowIso();
  db.insert(turns)
    .values({ id: turnId, episodeId: episode.id, seq, questionText: question, inputMode: input.inputMode ?? "typed", transcriptMeta: input.transcriptMeta ?? null, state: "retrieving", createdAt: now })
    .run();
  const setState = (patch: Partial<typeof turns.$inferInsert>) => db.update(turns).set(patch).where(eq(turns.id, turnId)).run();

  const adapter = getLlm(input.llmId ?? episode.llmProvider);
  const controller = new AbortController();
  inflight.set(turnId, controller);
  const started = Date.now();
  let retrieved: RetrievedPassage[] = [];
  try {
    // Retrieval is scoped to the research snapshot taken when the session started.
    const sourceIds = episode.researchSnapshot?.sourceIds ?? [];
    const retrieval = searchPassages(sqlite, guest.id, question, { limit: 8, sourceIds: sourceIds.length ? sourceIds : undefined });
    retrieved = retrieval.passages;
    setState({ retrievedPassageIds: retrieved.map((p) => p.passageId), state: "generating", provider: adapter.id });
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

    const system = buildSystemPrompt(profile, entries, answerLength);
    const history = buildHistory(prior.filter((t) => t.state === "ready").map((t) => ({ question: t.questionText, spokenText: t.spokenText })));
    const result = await adapter.generate({ system, turns: [...history, { role: "user", content: buildTurnMessage(question, retrieved, answerLength) }], signal: controller.signal });

    if (result.kind === "cancelled") {
      setState({ state: "interrupted", latencyMs: Date.now() - started, completedAt: nowIso(), error: "Stopped by the host before a response was produced." });
    } else if (result.kind === "error") {
      setState({ state: "failed", latencyMs: result.latencyMs, completedAt: nowIso(), error: result.message, producer: failedRecord("provider_error", result.message, retrieved) as unknown as Record<string, unknown> });
    } else if (result.kind === "refused") {
      setState({
        state: "needs_review",
        model: result.model,
        usage: result.usage,
        latencyMs: result.latencyMs,
        completedAt: nowIso(),
        error: `Provider declined: ${result.reason}`,
        producer: failedRecord("refused", result.reason, retrieved) as unknown as Record<string, unknown>,
      });
    } else {
      setState({ state: "validating" });
      const record = validateResponse(result.raw, retrieved, { maxSentences: LENGTH_GUIDE[answerLength].max + 2 });
      setState({
        state: record.validation.state,
        spokenText: record.spokenText,
        response: (result.raw ?? null) as Record<string, unknown> | null,
        producer: record as unknown as Record<string, unknown>,
        model: result.model,
        usage: result.usage,
        latencyMs: Date.now() - started,
        completedAt: nowIso(),
      });
    }
  } catch (err) {
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    setState({
      state: aborted ? "interrupted" : "failed",
      latencyMs: Date.now() - started,
      completedAt: nowIso(),
      error: aborted ? "Stopped by the host." : err instanceof Error ? err.message : "Unknown engine error",
      producer: aborted ? null : (failedRecord("provider_error", err instanceof Error ? err.message : "Unknown engine error", retrieved) as unknown as Record<string, unknown>),
    });
  } finally {
    inflight.delete(turnId);
    db.update(episodes).set({ updatedAt: nowIso() }).where(eq(episodes.id, episode.id)).run();
  }
  return db.select().from(turns).where(eq(turns.id, turnId)).get()!;
}

export function isEpisodeBusy(episode: Episode): boolean {
  const db = getDb();
  return !!db
    .select({ id: turns.id })
    .from(turns)
    .where(and(eq(turns.episodeId, episode.id), inArray(turns.state, [...ACTIVE_STATES])))
    .get();
}
