import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { passages, sources, type IngestStatus, type SourceType, type Source } from "@/lib/db/schema";
import { storageDir } from "@/lib/config/env";
import { newId, nowIso, passageId } from "@/lib/ids";
import { chunkPages, chunkText, cleanText, contentHash, type Chunk } from "./chunk";
import { extractPdfText } from "./pdf";

export type SourceMetadata = {
  title: string;
  authorOrg?: string;
  publishedAt?: string;
  url?: string;
  sourceType?: SourceType;
  locator?: string;
  summary?: string;
  provenanceNotes?: string;
  permissionNotes?: string;
  isPublic?: boolean;
};

export type IngestOutcome = { source: Source; passageCount: number; duplicatePassages: number; status: IngestStatus; message: string };

export const ALLOWED_UPLOADS: Record<string, { ext: string[]; kind: "text" | "markdown" | "pdf" }> = {
  "text/plain": { ext: [".txt", ".text"], kind: "text" },
  "text/markdown": { ext: [".md", ".markdown"], kind: "markdown" },
  "application/pdf": { ext: [".pdf"], kind: "pdf" },
};

export function detectUploadKind(filename: string, mime: string): "text" | "markdown" | "pdf" | null {
  const ext = path.extname(filename).toLowerCase();
  for (const [m, spec] of Object.entries(ALLOWED_UPLOADS)) {
    if (spec.ext.includes(ext)) return spec.kind;
    if (mime === m) return spec.kind;
  }
  if (mime === "application/octet-stream" && ext === ".md") return "markdown";
  return null;
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "upload";
}

function storeFile(guestId: string, sourceId: string, filename: string, data: Buffer): string {
  const dir = path.join(storageDir(), "research", guestId);
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join("research", guestId, `${sourceId}__${safeFilename(filename)}`);
  fs.writeFileSync(path.join(storageDir(), rel), data, { mode: 0o600 });
  return rel;
}

/** Manually entered record: pasted excerpt + metadata (no crawling). */
export function ingestManualRecord(db: Db, guestId: string, meta: SourceMetadata & { excerpt: string }): IngestOutcome {
  const excerpt = cleanText(meta.excerpt);
  const chunks = chunkText(excerpt, { locatorPrefix: meta.locator ?? "" });
  return persistSource(db, guestId, meta, { originalExcerpt: excerpt, chunks, status: chunks.length ? "ingested" : "failed", charCount: excerpt.length, error: chunks.length ? null : "Excerpt was empty." });
}

export function ingestText(db: Db, guestId: string, meta: SourceMetadata, text: string, file?: { filename: string; mime: string; data: Buffer }): IngestOutcome {
  const cleaned = cleanText(text);
  const chunks = chunkText(cleaned, { locatorPrefix: meta.locator ?? "" });
  return persistSource(db, guestId, meta, { originalExcerpt: cleaned.slice(0, 2000), chunks, status: chunks.length ? "ingested" : "failed", charCount: cleaned.length, error: chunks.length ? null : "No text content found.", file });
}

export async function ingestPdf(db: Db, guestId: string, meta: SourceMetadata, file: { filename: string; mime: string; data: Buffer }): Promise<IngestOutcome> {
  const extraction = await extractPdfText(file.data);
  if (extraction.kind === "ocr_required") {
    return persistSource(db, guestId, meta, { originalExcerpt: "", chunks: [], status: "ocr_required", charCount: 0, error: extraction.reason, file });
  }
  if (extraction.kind === "error") {
    return persistSource(db, guestId, meta, { originalExcerpt: "", chunks: [], status: "failed", charCount: 0, error: extraction.message, file });
  }
  const chunks = chunkPages(extraction.pages);
  const excerpt = cleanText(extraction.pages.map((p) => p.text).join("\n\n")).slice(0, 2000);
  return persistSource(db, guestId, meta, { originalExcerpt: excerpt, chunks, status: chunks.length ? "ingested" : "failed", charCount: extraction.charCount, error: chunks.length ? null : "No text could be extracted.", file });
}

function persistSource(
  db: Db,
  guestId: string,
  meta: SourceMetadata,
  body: { originalExcerpt: string; chunks: Chunk[]; status: IngestStatus; charCount: number; error: string | null; file?: { filename: string; mime: string; data: Buffer } },
): IngestOutcome {
  const id = newId("src");
  const now = nowIso();
  const fileRef = body.file ? storeFile(guestId, id, body.file.filename, body.file.data) : null;
  const docHash = body.file ? createHash("sha256").update(body.file.data).digest("hex") : contentHash(body.originalExcerpt || meta.title);

  let duplicatePassages = 0;
  db.transaction((tx) => {
    tx.insert(sources)
      .values({
        id,
        guestId,
        title: meta.title.trim(),
        authorOrg: meta.authorOrg?.trim() ?? "",
        publishedAt: meta.publishedAt?.trim() ?? "",
        url: meta.url?.trim() ?? "",
        fileRef,
        originalFilename: body.file?.filename ?? null,
        mimeType: body.file?.mime ?? null,
        fileSize: body.file?.data.length ?? null,
        accessedAt: now,
        sourceType: meta.sourceType ?? "other",
        locator: meta.locator?.trim() ?? "",
        originalExcerpt: body.originalExcerpt,
        summary: meta.summary?.trim() ?? "",
        provenanceNotes: meta.provenanceNotes?.trim() ?? "",
        permissionNotes: meta.permissionNotes?.trim() ?? "",
        isPublic: meta.isPublic ?? true,
        ingestStatus: body.status,
        ingestError: body.error,
        contentHash: docHash,
        charCount: body.charCount,
        passageCount: body.chunks.length,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Exact-duplicate detection against the guest's existing passages (normalized text hash).
    const existing = tx
      .select({ id: passages.id, hash: passages.contentHash })
      .from(passages)
      .where(and(eq(passages.guestId, guestId), sql`${passages.duplicateOf} IS NULL`))
      .all();
    const canonicalByHash = new Map(existing.map((e) => [e.hash, e.id]));

    for (const c of body.chunks) {
      const pid = passageId(id, c.seq);
      const dup = canonicalByHash.get(c.contentHash) ?? null;
      if (dup) duplicatePassages++;
      else canonicalByHash.set(c.contentHash, pid);
      tx.insert(passages)
        .values({
          id: pid,
          sourceId: id,
          guestId,
          seq: c.seq,
          text: c.text,
          locator: c.locator,
          charStart: c.charStart,
          charEnd: c.charEnd,
          contentHash: c.contentHash,
          duplicateOf: dup,
          createdAt: now,
        })
        .run();
    }
  });

  const source = db.select().from(sources).where(eq(sources.id, id)).get()!;
  const message =
    body.status === "ingested"
      ? `Ingested ${body.chunks.length} passage(s)${duplicatePassages ? `, ${duplicatePassages} duplicate(s) of existing material` : ""}.`
      : body.status === "ocr_required"
        ? `OCR required: ${body.error}`
        : `Ingestion failed: ${body.error}`;
  return { source, passageCount: body.chunks.length, duplicatePassages, status: body.status, message };
}

export function deleteSource(db: Db, sourceId: string): boolean {
  const src = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!src) return false;
  db.delete(sources).where(eq(sources.id, sourceId)).run(); // passages cascade; FTS triggers keep the index in sync
  if (src.fileRef) {
    const abs = path.join(storageDir(), src.fileRef);
    if (abs.startsWith(storageDir()) && fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  return true;
}
