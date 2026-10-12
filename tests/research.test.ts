import { beforeAll, describe, expect, it } from "vitest";
import { openMemoryDatabase } from "@/lib/db/client";
import { createGuest } from "@/lib/services/guests";
import { ingestManualRecord, ingestPdf, ingestText, updateSource } from "@/lib/research/ingest";
import { createEpisode, reviewQueue, setTurnReview, startEpisode } from "@/lib/services/episodes";
import { turns } from "@/lib/db/schema";
import { buildFtsQuery, getPassagesByIds, searchPassages } from "@/lib/research/retrieval";
import { chunkText, cleanText } from "@/lib/research/chunk";
import { FIXTURE_GUEST, FIXTURE_SOURCE_A, FIXTURE_SOURCE_B, FIXTURE_SOURCE_C, FIXTURE_SOURCE_INJECTION, makeImageOnlyPdf, makeTextPdf } from "./fixtures/synthetic";

process.env.UNSAID_STORAGE_DIR = "/tmp/claude-0/-home-user-UNSAID/6b284b05-0535-5b11-981b-a1e5d1af0449/scratchpad/test-storage";

describe("chunking", () => {
  it("splits paragraphs into bounded passages with stable offsets", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}. ${"Lamp oil and salt wind. ".repeat(8)}`).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1400);
      expect(cleanText(text).slice(c.charStart, c.charStart + 12)).toContain("Paragraph");
    }
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i + 1));
  });
  it("returns nothing for empty input", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
  });
});

describe("fts query builder", () => {
  it("drops stopwords and quotes terms", () => {
    const q = buildFtsQuery("Why did you refuse to signal the freighter?");
    expect(q).toContain('"refuse"*');
    expect(q).toContain('"signal"*');
    expect(q).not.toContain('"the"');
  });
  it("neutralises fts operators", () => {
    expect(buildFtsQuery('NEAR( "x" ) AND OR NOT ^ *')).not.toMatch(/NEAR|AND|NOT/);
  });
  it("builds an all-terms variant and honours quoted phrases", () => {
    expect(buildFtsQuery("lamp burned all night", "all")).toBe('"lamp" AND "burned"* AND "night"*');
    expect(buildFtsQuery('did she say "read the log" to the board?', "any")).toBe('"read the log" AND ("say" OR "board"*)');
  });
});

describe("ingestion + retrieval", () => {
  const { db, sqlite } = openMemoryDatabase();
  let guestId = "";
  beforeAll(() => {
    const g = createGuest(db, { ...FIXTURE_GUEST, status: "draft", bioSummary: "", bioSources: [], researchStatus: "not_started", knowledgeCutoff: "", perspective: "retrospective", perspectiveNotes: "", speakingStyle: "", personalityInterpretations: "", answerLength: "medium", voiceConfig: { provider: "none", kind: "stock", consentStatus: "not_applicable" }, avatarConfig: { mode: "static_image", provider: "none" }, assetApproval: { status: "pending" } });
    guestId = g.id;
    ingestManualRecord(db, guestId, FIXTURE_SOURCE_A);
    ingestManualRecord(db, guestId, FIXTURE_SOURCE_B);
  });

  it("creates passages with stable ids and returns real excerpts", () => {
    const r = searchPassages(sqlite, guestId, "Did you extinguish the lamp during the gale?");
    expect(r.passages.length).toBeGreaterThan(0);
    const ids = r.passages.map((p) => p.passageId);
    expect(ids.every((id) => /^psg_[a-z0-9]+_\d{4}$/.test(id))).toBe(true);
    const again = getPassagesByIds(sqlite, ids);
    expect(again.map((p) => p.text)).toEqual(r.passages.map((p) => p.text));
    expect(r.passages.some((p) => p.text.includes("force eleven"))).toBe(true);
  });

  it("preserves conflicting accounts as separate passages", () => {
    const r = searchPassages(sqlite, guestId, "Orrin Vale complaint freighter Anselm lamp", { limit: 10 });
    const texts = r.passages.map((p) => p.text).join("\n");
    expect(texts).toContain("not substantiated");
    expect(texts).toContain("maintained his account");
  });

  it("collapses exact duplicates onto the canonical passage but keeps the ids", () => {
    const out = ingestManualRecord(db, guestId, FIXTURE_SOURCE_C);
    expect(out.duplicatePassages).toBe(1);
    const r = searchPassages(sqlite, guestId, "countersigned relief keeper log", { limit: 10 });
    const withDup = r.passages.find((p) => p.duplicateIds.length > 0);
    expect(withDup).toBeDefined();
    expect(r.passages.filter((p) => p.text.includes("countersigned")).length).toBe(1);
  });

  it("stores injection attempts as plain data", () => {
    ingestManualRecord(db, guestId, FIXTURE_SOURCE_INJECTION);
    const r = searchPassages(sqlite, guestId, "cat named Lantern oil store");
    expect(r.passages[0]?.text).toContain("ignore all previous instructions");
  });

  it("ranks all-terms matches first and only fills with any-term matches", () => {
    const r = searchPassages(sqlite, guestId, "freighter Anselm endangered", { limit: 10 });
    expect(r.passages[0]?.matchMode).toBe("all_terms");
    expect(r.passages[0]?.text).toContain("Anselm");
    expect(["all_terms", "mixed"]).toContain(r.strategy);
    const only = r.passages.filter((p) => p.matchMode === "all_terms");
    expect(only.length).toBeGreaterThanOrEqual(1);
    const idx = r.passages.findIndex((p) => p.matchMode === "any_term");
    if (idx >= 0) expect(r.passages.slice(idx).every((p) => p.matchMode === "any_term")).toBe(true);
  });

  it("excludes producer-excluded sources from retrieval and from episode snapshots, keeps disputed ones tagged", () => {
    const before = searchPassages(sqlite, guestId, "complaint Orrin Vale freighter", { limit: 10 });
    const minutes = before.passages.find((p) => p.source.title.startsWith("Harbour board"))!;
    expect(minutes).toBeDefined();
    const disputed = updateSource(db, minutes.sourceId, { reviewStatus: "disputed", reviewNotes: "Transcript provenance unclear (synthetic)." })!;
    expect(disputed.reviewStatus).toBe("disputed");
    expect(disputed.reviewedAt).toBeTruthy();
    const mid = searchPassages(sqlite, guestId, "complaint Orrin Vale freighter", { limit: 10 });
    expect(mid.passages.find((p) => p.sourceId === minutes.sourceId)?.source.reviewStatus).toBe("disputed");
    updateSource(db, minutes.sourceId, { reviewStatus: "excluded" });
    const after = searchPassages(sqlite, guestId, "complaint Orrin Vale freighter", { limit: 10 });
    expect(after.passages.some((p) => p.sourceId === minutes.sourceId)).toBe(false);
    const ep = startEpisode(db, createEpisode(db, { guestId, title: "snapshot test", mode: "text" }).id);
    expect(ep.researchSnapshot.sourceIds).not.toContain(minutes.sourceId);
    updateSource(db, minutes.sourceId, { reviewStatus: "reviewed" });
    expect(searchPassages(sqlite, guestId, "complaint Orrin Vale freighter", { limit: 10 }).passages.some((p) => p.sourceId === minutes.sourceId)).toBe(true);
  });

  it("review queue lists held turns and pending sources, and resolution clears a turn", () => {
    const ep = startEpisode(db, createEpisode(db, { guestId, title: "queue test", mode: "text" }).id);
    const now = new Date().toISOString();
    db.insert(turns).values({ id: "trn_q1", episodeId: ep.id, seq: 1, questionText: "q", state: "needs_review", spokenText: "held", createdAt: now }).run();
    db.insert(turns).values({ id: "trn_q2", episodeId: ep.id, seq: 2, questionText: "q", state: "ready", spokenText: "fine", reviewFlag: true, createdAt: now }).run();
    db.insert(turns).values({ id: "trn_q3", episodeId: ep.id, seq: 3, questionText: "q", state: "ready", spokenText: "fine", createdAt: now }).run();
    let q = reviewQueue(db);
    const ids = q.heldTurns.map((h) => h.turn.id);
    expect(ids).toContain("trn_q1");
    expect(ids).toContain("trn_q2");
    expect(ids).not.toContain("trn_q3");
    expect(q.pendingSources.some((s) => s.source.reviewStatus === "unreviewed")).toBe(true);
    const resolved = setTurnReview(db, "trn_q1", { reviewResolved: true, reviewNote: "checked against minutes" })!;
    expect(resolved.reviewResolvedAt).toBeTruthy();
    q = reviewQueue(db);
    expect(q.heldTurns.map((h) => h.turn.id)).not.toContain("trn_q1");
  });

  it("scopes retrieval to the given source ids", () => {
    const all = searchPassages(sqlite, guestId, "lamp log gale", { limit: 20 });
    const one = all.passages[0]!.sourceId;
    const scoped = searchPassages(sqlite, guestId, "lamp log gale", { limit: 20, sourceIds: [one] });
    expect(scoped.passages.every((p) => p.sourceId === one)).toBe(true);
  });

  it("ingests text-based PDFs page by page and flags scans as OCR required", async () => {
    const pdf = makeTextPdf("Synthetic PDF fixture: the keeper recorded a force eleven wind and kept the lamp burning until dawn on the island.");
    const ok = await ingestPdf(db, guestId, { title: "Synthetic PDF", sourceType: "other" }, { filename: "fixture.pdf", mime: "application/pdf", data: pdf });
    expect(ok.status).toBe("ingested");
    expect(ok.passageCount).toBe(1);
    const r = searchPassages(sqlite, guestId, "synthetic pdf fixture dawn");
    expect(r.passages[0]?.locator).toBe("p. 1");

    const scan = await ingestPdf(db, guestId, { title: "Scan", sourceType: "other" }, { filename: "scan.pdf", mime: "application/pdf", data: makeImageOnlyPdf() });
    expect(scan.status).toBe("ocr_required");
    expect(scan.source.ingestError).toMatch(/scanned/i);
  });

  it("ingests markdown/text uploads", () => {
    const out = ingestText(db, guestId, { title: "Notes", sourceType: "personal_notes" }, "# Heading\n\nSome synthetic markdown about the dory and the eastern railing.", { filename: "notes.md", mime: "text/markdown", data: Buffer.from("x") });
    expect(out.status).toBe("ingested");
    expect(out.source.fileRef).toMatch(/research\//);
  });
});
