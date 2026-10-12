import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import {
  ANSWER_LENGTHS,
  ENTRY_CATEGORIES,
  GUEST_STATUSES,
  PERSPECTIVES,
  RESEARCH_STATUSES,
  guestEntries,
  guestInstructionVersions,
  guests,
  type Guest,
  type GuestEntry,
} from "@/lib/db/schema";
import { newId, nowIso } from "@/lib/ids";

export const GuestInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  simulationLabel: z.string().trim().min(1).max(60).default("AI SIMULATION"),
  status: z.enum(GUEST_STATUSES).default("draft"),
  bioSummary: z.string().max(6000).default(""),
  bioSources: z.array(z.object({ label: z.string().max(300), url: z.string().max(2000).optional(), sourceId: z.string().optional(), passageId: z.string().optional() })).max(50).default([]),
  researchStatus: z.enum(RESEARCH_STATUSES).default("not_started"),
  knowledgeCutoff: z.string().max(200).default(""),
  perspective: z.enum(PERSPECTIVES).default("retrospective"),
  perspectiveNotes: z.string().max(2000).default(""),
  speakingStyle: z.string().max(4000).default(""),
  personalityInterpretations: z.string().max(4000).default(""),
  answerLength: z.enum(ANSWER_LENGTHS).default("medium"),
  voiceConfig: z
    .object({
      provider: z.enum(["none", "elevenlabs"]).default("none"),
      voiceId: z.string().max(200).optional(),
      label: z.string().max(200).optional(),
      kind: z.enum(["stock", "custom"]).default("stock"),
      consentStatus: z.enum(["not_applicable", "pending", "verified"]).default("not_applicable"),
      notes: z.string().max(1000).optional(),
    })
    .default({ provider: "none", kind: "stock", consentStatus: "not_applicable" }),
  avatarConfig: z
    .object({
      mode: z.enum(["static_image", "provider_avatar"]).default("static_image"),
      provider: z.enum(["none", "tavus", "heygen"]).default("none"),
      avatarId: z.string().max(200).optional(),
      staticAssetId: z.string().max(100).optional(),
      notes: z.string().max(1000).optional(),
    })
    .default({ mode: "static_image", provider: "none" }),
  assetApproval: z
    .object({ status: z.enum(["pending", "approved", "rejected"]).default("pending"), notes: z.string().max(1000).optional(), decidedAt: z.string().optional() })
    .default({ status: "pending" }),
});
export type GuestInput = z.infer<typeof GuestInputSchema>;
export const GuestPatchSchema = GuestInputSchema.partial().extend({ changeNote: z.string().max(500).optional() });

export const EntryInputSchema = z.object({
  category: z.enum(ENTRY_CATEGORIES),
  text: z.string().trim().min(1).max(4000),
  sourceId: z.string().optional().nullable(),
  passageId: z.string().optional().nullable(),
  note: z.string().max(1000).default(""),
});

/** Fields that change how the simulation behaves; edits to these create a new instruction version. */
const INSTRUCTION_FIELDS = ["displayName", "simulationLabel", "bioSummary", "knowledgeCutoff", "perspective", "perspectiveNotes", "speakingStyle", "personalityInterpretations", "answerLength"] as const;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "guest";
}

export function instructionSnapshot(g: Guest, entries: GuestEntry[]): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const f of INSTRUCTION_FIELDS) snap[f] = g[f];
  snap.entries = entries;
  return snap;
}

export function listGuests(db: Db): Guest[] {
  return db.select().from(guests).orderBy(asc(guests.createdAt)).all();
}

export function getGuest(db: Db, idOrSlug: string): Guest | undefined {
  return db.select().from(guests).where(eq(guests.id, idOrSlug)).get() ?? db.select().from(guests).where(eq(guests.slug, idOrSlug)).get();
}

export function listEntries(db: Db, guestId: string): GuestEntry[] {
  return db.select().from(guestEntries).where(eq(guestEntries.guestId, guestId)).orderBy(asc(guestEntries.createdAt)).all();
}

export function listVersions(db: Db, guestId: string) {
  return db.select().from(guestInstructionVersions).where(eq(guestInstructionVersions.guestId, guestId)).orderBy(desc(guestInstructionVersions.version)).all();
}

function uniqueSlug(db: Db, base: string, excludeId?: string): string {
  let slug = base;
  let n = 2;
  while (true) {
    const hit = db.select({ id: guests.id }).from(guests).where(eq(guests.slug, slug)).get();
    if (!hit || hit.id === excludeId) return slug;
    slug = `${base}-${n++}`;
  }
}

export function createGuest(db: Db, input: GuestInput, changeNote = "Profile created"): Guest {
  const id = newId("gst");
  const now = nowIso();
  db.insert(guests)
    .values({ id, slug: uniqueSlug(db, slugify(input.displayName)), ...input, currentVersion: 1, createdAt: now, updatedAt: now })
    .run();
  const g = db.select().from(guests).where(eq(guests.id, id)).get()!;
  db.insert(guestInstructionVersions).values({ id: newId("ver"), guestId: id, version: 1, snapshot: instructionSnapshot(g, []), changeNote, createdAt: now }).run();
  return g;
}

export function updateGuest(db: Db, id: string, patch: z.infer<typeof GuestPatchSchema>): Guest | undefined {
  const current = db.select().from(guests).where(eq(guests.id, id)).get();
  if (!current) return undefined;
  const { changeNote, ...fields } = patch;
  const instructionChanged = INSTRUCTION_FIELDS.some((f) => f in fields && fields[f] !== undefined && fields[f] !== current[f]);
  const now = nowIso();
  const nextVersion = instructionChanged ? current.currentVersion + 1 : current.currentVersion;
  db.update(guests)
    .set({
      ...fields,
      ...(fields.displayName && fields.displayName !== current.displayName ? { slug: uniqueSlug(db, slugify(fields.displayName), id) } : {}),
      currentVersion: nextVersion,
      updatedAt: now,
    })
    .where(eq(guests.id, id))
    .run();
  const g = db.select().from(guests).where(eq(guests.id, id)).get()!;
  if (instructionChanged) {
    db.insert(guestInstructionVersions)
      .values({ id: newId("ver"), guestId: id, version: nextVersion, snapshot: instructionSnapshot(g, listEntries(db, id)), changeNote: changeNote ?? "Instructions edited", createdAt: now })
      .run();
  }
  return g;
}

export function deleteGuest(db: Db, id: string): { ok: boolean; reason?: string } {
  const episodeCount = db.get<{ n: number }>(sql`select count(*) as n from episodes where guest_id = ${id}`)?.n ?? 0;
  if (episodeCount > 0) return { ok: false, reason: `Guest has ${episodeCount} episode(s). Delete those first; profiles with recorded episodes are kept for provenance.` };
  const res = db.delete(guests).where(eq(guests.id, id)).run();
  return { ok: res.changes > 0 };
}

export function addEntry(db: Db, guestId: string, input: z.infer<typeof EntryInputSchema>): GuestEntry {
  const id = newId("ent");
  const now = nowIso();
  db.insert(guestEntries).values({ id, guestId, category: input.category, text: input.text, sourceId: input.sourceId ?? null, passageId: input.passageId ?? null, note: input.note, createdAt: now, updatedAt: now }).run();
  bumpVersion(db, guestId, `Ledger: added ${input.category.replace(/_/g, " ")}`);
  return db.select().from(guestEntries).where(eq(guestEntries.id, id)).get()!;
}

export function deleteEntry(db: Db, guestId: string, entryId: string): boolean {
  const res = db.delete(guestEntries).where(eq(guestEntries.id, entryId)).run();
  if (res.changes > 0) bumpVersion(db, guestId, "Ledger: entry removed");
  return res.changes > 0;
}

function bumpVersion(db: Db, guestId: string, note: string) {
  const g = db.select().from(guests).where(eq(guests.id, guestId)).get();
  if (!g) return;
  const now = nowIso();
  const v = g.currentVersion + 1;
  db.update(guests).set({ currentVersion: v, updatedAt: now }).where(eq(guests.id, guestId)).run();
  db.insert(guestInstructionVersions).values({ id: newId("ver"), guestId, version: v, snapshot: instructionSnapshot({ ...g, currentVersion: v }, listEntries(db, guestId)), changeNote: note, createdAt: now }).run();
}
