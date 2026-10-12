import { ElevenLabsClient, ElevenLabsError, ElevenLabsTimeoutError } from "@elevenlabs/elevenlabs-js";
import { redactSecrets } from "@/lib/config/env";

let cached: ElevenLabsClient | null = null;

/** One shared SDK client. The key is read server-side only; never passed to the browser. */
export function getElevenLabs(): ElevenLabsClient {
  if (!cached) cached = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  return cached;
}

/** Tests swap the client; production never calls this. */
export function __setElevenLabsClientForTests(c: ElevenLabsClient | null) {
  cached = c;
}

export function describeElevenLabsError(err: unknown): { message: string; retryable: boolean; status?: number } {
  if (err instanceof ElevenLabsTimeoutError) return { message: "ElevenLabs request timed out.", retryable: true };
  if (err instanceof ElevenLabsError) {
    const s = err.statusCode;
    const detail = extractDetail(err.body);
    if (s === 401) return { message: "ElevenLabs rejected the API key (401).", retryable: false, status: s };
    if (s === 402) return { message: `ElevenLabs quota or payment issue (402)${detail ? `: ${detail}` : ""}.`, retryable: false, status: s };
    if (s === 403) return { message: `ElevenLabs permission denied (403)${detail ? `: ${detail}` : ""}.`, retryable: false, status: s };
    if (s === 404) return { message: `ElevenLabs resource not found (404)${detail ? `: ${detail}` : ""}. Check the voice id or model id.`, retryable: false, status: s };
    if (s === 422) return { message: `ElevenLabs rejected the request (422)${detail ? `: ${detail}` : ""}.`, retryable: false, status: s };
    if (s === 429) return { message: "ElevenLabs rate limit or concurrency limit reached (429).", retryable: true, status: s };
    if (s && s >= 500) return { message: `ElevenLabs server error (${s}).`, retryable: true, status: s };
    return { message: redactSecrets(`ElevenLabs error${s ? ` ${s}` : ""}: ${detail || err.message}`), retryable: false, status: s };
  }
  if (err instanceof Error && err.name === "AbortError") return { message: "Cancelled.", retryable: false };
  if (err instanceof Error) return { message: redactSecrets(err.message), retryable: /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(err.message) };
  return { message: "Unknown ElevenLabs error", retryable: false };
}

function extractDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as { detail?: unknown };
  if (typeof b.detail === "string") return b.detail;
  if (b.detail && typeof b.detail === "object") {
    const d = b.detail as { message?: string; status?: string };
    return [d.status, d.message].filter(Boolean).join(" ");
  }
  return "";
}
