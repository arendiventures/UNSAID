import { createHash } from "node:crypto";

export type Chunk = {
  seq: number;
  text: string;
  charStart: number;
  charEnd: number;
  locator: string;
  contentHash: string;
};

export type PageText = { page: number; text: string };

const TARGET = 900; // characters per passage (roughly 150-200 words)
const MAX = 1400;
const MIN_TAIL = 250;

export function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeForHash(text)).digest("hex").slice(0, 32);
}

export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(paragraph: string): string[] {
  const parts = paragraph.split(/(?<=[.!?]["')\]]?)\s+(?=[A-Z0-9"'(\[])/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Paragraph-aware chunking. Paragraphs are packed up to TARGET characters; a single
 * paragraph longer than MAX is split on sentence boundaries. Offsets refer to the
 * cleaned text so passages can be highlighted in the source browser.
 */
export function chunkText(raw: string, opts: { locatorPrefix?: string; startSeq?: number; baseOffset?: number } = {}): Chunk[] {
  const text = cleanText(raw);
  if (!text) return [];
  const paragraphs: { text: string; start: number }[] = [];
  let cursor = 0;
  for (const para of text.split(/\n\s*\n/)) {
    const idx = text.indexOf(para, cursor);
    const start = idx >= 0 ? idx : cursor;
    const trimmed = para.trim();
    if (trimmed) paragraphs.push({ text: trimmed, start: start + (para.length - para.trimStart().length) });
    cursor = start + para.length;
  }

  // Expand over-long paragraphs into sentence groups.
  const units: { text: string; start: number }[] = [];
  for (const p of paragraphs) {
    if (p.text.length <= MAX) {
      units.push(p);
      continue;
    }
    let local = 0;
    let buf = "";
    let bufStart = p.start;
    for (const s of splitSentences(p.text)) {
      const sIdx = p.text.indexOf(s, local);
      const sStart = p.start + (sIdx >= 0 ? sIdx : local);
      local = (sIdx >= 0 ? sIdx : local) + s.length;
      if (buf && buf.length + s.length + 1 > TARGET) {
        units.push({ text: buf, start: bufStart });
        buf = "";
      }
      if (!buf) bufStart = sStart;
      buf = buf ? `${buf} ${s}` : s;
      // A single sentence longer than MAX is hard-split.
      while (buf.length > MAX) {
        units.push({ text: buf.slice(0, MAX), start: bufStart });
        bufStart += MAX;
        buf = buf.slice(MAX);
      }
    }
    if (buf) units.push({ text: buf, start: bufStart });
  }

  const chunks: Chunk[] = [];
  let buf = "";
  let bufStart = 0;
  const flush = () => {
    if (!buf.trim()) return;
    const seq = (opts.startSeq ?? 1) + chunks.length;
    const start = (opts.baseOffset ?? 0) + bufStart;
    chunks.push({
      seq,
      text: buf.trim(),
      charStart: start,
      charEnd: start + buf.length,
      locator: opts.locatorPrefix ?? "",
      contentHash: contentHash(buf),
    });
    buf = "";
  };
  for (const u of units) {
    if (buf && buf.length + u.text.length + 2 > TARGET) flush();
    if (!buf) bufStart = u.start;
    buf = buf ? `${buf}\n\n${u.text}` : u.text;
  }
  flush();

  // Merge a tiny trailing chunk into its predecessor.
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1]!;
    const prev = chunks[chunks.length - 2]!;
    if (last.text.length < MIN_TAIL && prev.text.length + last.text.length < MAX) {
      prev.text = `${prev.text}\n\n${last.text}`;
      prev.charEnd = last.charEnd;
      prev.contentHash = contentHash(prev.text);
      chunks.pop();
    }
  }
  return chunks;
}

/** Chunk page-by-page so each passage keeps a page locator. */
export function chunkPages(pages: PageText[]): Chunk[] {
  const out: Chunk[] = [];
  let seq = 1;
  let offset = 0;
  for (const p of pages) {
    const cleaned = cleanText(p.text);
    const chunks = chunkText(cleaned, { locatorPrefix: `p. ${p.page}`, startSeq: seq, baseOffset: offset });
    out.push(...chunks);
    seq += chunks.length;
    offset += cleaned.length + 2;
  }
  return out;
}
