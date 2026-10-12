import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { ANSWER_LENGTHS, EPISODE_MODES, episodes, guests, sources, turns, type Episode, type Turn } from "@/lib/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { defaultLlmId, getLlm, modeAvailability } from "@/lib/providers/registry";
import { EngineError } from "@/lib/engine/run";
import { instructionSnapshot, listEntries } from "./guests";

export const EpisodeInputSchema = z.object({
  guestId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  mode: z.enum(EPISODE_MODES).default("text"),
  answerLength: z.enum(ANSWER_LENGTHS).nullable().optional(),
  llmProvider: z.string().max(60).nullable().optional(),
});

export function listEpisodes(db: Db) {
  return db
    .select({ episode: episodes, guestName: guests.displayName, turnCount: sql<number>`(select count(*) from turns t where t.episode_id = ${episodes.id})` })
    .from(episodes)
    .innerJoin(guests, eq(guests.id, episodes.guestId))
    .orderBy(desc(episodes.createdAt))
    .all();
}

export function getEpisode(db: Db, id: string): Episode | undefined {
  return db.select().from(episodes).where(eq(episodes.id, id)).get();
}

export function listTurns(db: Db, episodeId: string): Turn[] {
  return db.select().from(turns).where(eq(turns.episodeId, episodeId)).orderBy(asc(turns.seq)).all();
}

export function createEpisode(db: Db, input: z.infer<typeof EpisodeInputSchema>): Episode {
  const guest = db.select().from(guests).where(eq(guests.id, input.guestId)).get();
  if (!guest) throw new EngineError("Guest not found", 404);
  const modes = modeAvailability();
  if (!modes[input.mode].available) throw new EngineError(`${input.mode} mode is not available: ${modes[input.mode].reason}`, 409);
  const id = newId("ep");
  const now = nowIso();
  const llmId = input.llmProvider && getLlm(input.llmProvider).id === input.llmProvider ? input.llmProvider : defaultLlmId();
  db.insert(episodes)
    .values({
      id,
      guestId: guest.id,
      title: input.title,
      mode: input.mode,
      status: "draft",
      guestVersion: guest.currentVersion,
      answerLength: input.answerLength ?? null,
      llmProvider: llmId,
      llmModel: getLlm(llmId).info().selection.model ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getEpisode(db, id)!;
}

/** Freezes the guest instructions and the research collection for provenance, then goes live. */
export function startEpisode(db: Db, id: string): Episode {
  const ep = getEpisode(db, id);
  if (!ep) throw new Error("Episode not found");
  if (ep.status === "ended") throw new Error("Episode already ended");
  if (ep.status === "live") return ep;
  const guest = db.select().from(guests).where(eq(guests.id, ep.guestId)).get()!;
  const srcIds = db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.guestId, guest.id), eq(sources.ingestStatus, "ingested")))
    .all()
    .map((s) => s.id);
  const passageCount = db.get<{ n: number }>(sql`select count(*) as n from passages where guest_id = ${guest.id}`)?.n ?? 0;
  const now = nowIso();
  const llmId = ep.llmProvider ?? defaultLlmId();
  db.update(episodes)
    .set({
      status: "live",
      startedAt: now,
      updatedAt: now,
      guestVersion: guest.currentVersion,
      guestSnapshot: instructionSnapshot(guest, listEntries(db, guest.id)),
      researchSnapshot: { takenAt: now, sourceIds: srcIds, passageCount },
      llmProvider: llmId,
      llmModel: getLlm(llmId).info().selection.model ?? null,
    })
    .where(eq(episodes.id, id))
    .run();
  return getEpisode(db, id)!;
}

export function endEpisode(db: Db, id: string): Episode | undefined {
  const now = nowIso();
  db.update(episodes).set({ status: "ended", endedAt: now, updatedAt: now }).where(eq(episodes.id, id)).run();
  return getEpisode(db, id);
}

export const EpisodePatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  hostNotes: z.string().max(20000).optional(),
  answerLength: z.enum(ANSWER_LENGTHS).nullable().optional(),
  llmProvider: z.string().max(60).optional(),
});

export function patchEpisode(db: Db, id: string, patch: z.infer<typeof EpisodePatchSchema>): Episode | undefined {
  const ep = getEpisode(db, id);
  if (!ep) return undefined;
  const set: Partial<typeof episodes.$inferInsert> = { updatedAt: nowIso() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.hostNotes !== undefined) set.hostNotes = patch.hostNotes;
  if (patch.answerLength !== undefined) set.answerLength = patch.answerLength;
  if (patch.llmProvider !== undefined) {
    const adapter = getLlm(patch.llmProvider);
    set.llmProvider = adapter.id;
    set.llmModel = adapter.info().selection.model ?? null;
  }
  db.update(episodes).set(set).where(eq(episodes.id, id)).run();
  return getEpisode(db, id);
}

export function setTurnReview(db: Db, turnId: string, reviewFlag: boolean, reviewNote?: string): Turn | undefined {
  db.update(turns)
    .set({ reviewFlag, ...(reviewNote !== undefined ? { reviewNote } : {}) })
    .where(eq(turns.id, turnId))
    .run();
  return db.select().from(turns).where(eq(turns.id, turnId)).get();
}

export function deleteEpisode(db: Db, id: string): boolean {
  return db.delete(episodes).where(eq(episodes.id, id)).run().changes > 0;
}
