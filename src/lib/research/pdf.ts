import { PDFParse } from "pdf-parse";
import type { PageText } from "./chunk";

export type PdfExtraction =
  | { kind: "text"; pages: PageText[]; pageCount: number; charCount: number }
  | { kind: "ocr_required"; pageCount: number; reason: string }
  | { kind: "error"; message: string };

const MIN_CHARS_PER_PAGE = 40;

/**
 * Extract text from a text-based PDF. Scanned PDFs (no text layer) are reported as
 * "ocr_required" - OCR is not implemented, and we never pretend otherwise.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtraction> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const pages: PageText[] = result.pages.map((p) => ({ page: p.num, text: p.text ?? "" }));
    const pageCount = pages.length;
    const charCount = pages.reduce((n, p) => n + p.text.replace(/\s+/g, "").length, 0);
    if (pageCount === 0) return { kind: "error", message: "PDF contains no pages." };
    if (charCount < MIN_CHARS_PER_PAGE * Math.max(1, Math.ceil(pageCount / 2))) {
      return { kind: "ocr_required", pageCount, reason: `Only ${charCount} characters of extractable text across ${pageCount} page(s); this looks like a scanned document.` };
    }
    return { kind: "text", pages, pageCount, charCount };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "PDF parsing failed." };
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}
