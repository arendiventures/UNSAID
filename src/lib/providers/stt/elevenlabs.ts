import { missingVars } from "@/lib/config/env";
import type { ConnectionTest, ProviderInfo, SttAdapter } from "../types";
import { describeElevenLabsError, getElevenLabs } from "../elevenlabs/client";

export const ELEVENLABS_STT_ID = "elevenlabs-stt";

export function sttModel(): string {
  return process.env.UNSAID_STT_MODEL?.trim() || "scribe_v2";
}

/**
 * Batch transcription of a push-to-talk clip via ElevenLabs Scribe (POST /v1/speech-to-text).
 * Realtime streaming transcription (scribe_v2_realtime over WebSocket) is deliberately not
 * implemented in this milestone.
 */
export class ElevenLabsSttAdapter implements SttAdapter {
  readonly id = ELEVENLABS_STT_ID;

  info(): ProviderInfo {
    const missing = missingVars("elevenlabs");
    return {
      id: this.id,
      category: "stt",
      name: "ElevenLabs Scribe (speech-to-text)",
      implemented: true,
      configured: missing.length === 0,
      missingEnv: missing,
      selection: { model: sttModel() },
      capabilities: [
        { key: "batch", label: "Push-to-talk clip transcription", supported: true },
        { key: "language_detect", label: "Automatic language detection", supported: true },
        { key: "realtime", label: "Hands-free streaming transcription", supported: false, note: "scribe_v2_realtime (WebSocket) not implemented yet" },
        { key: "cancellation", label: "Cancel an in-flight request", supported: true },
      ],
      notes: ["Set ELEVENLABS_API_KEY in .env.local. Model from UNSAID_STT_MODEL (default scribe_v2).", "Audio clips are sent to ElevenLabs for transcription; nothing is sent until you release push-to-talk."],
      docsUrl: "https://elevenlabs.io/docs/api-reference/speech-to-text/convert",
    };
  }

  async test(): Promise<ConnectionTest> {
    return testElevenLabs("speech-to-text");
  }

  async transcribe(audio: Buffer, mimeType: string, signal?: AbortSignal) {
    const started = Date.now();
    const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : "audio";
    const file = new File([new Uint8Array(audio)], `host-question.${ext}`, { type: mimeType });
    try {
      const res = await getElevenLabs().speechToText.convert({ modelId: sttModel(), file, tagAudioEvents: false, diarize: false }, { abortSignal: signal, timeoutInSeconds: 90 });
      if (!("text" in res) || typeof res.text !== "string") {
        throw new Error("ElevenLabs returned a transcription shape this app does not handle (multichannel or webhook response).");
      }
      return { text: res.text.trim(), durationMs: Date.now() - started, raw: { languageCode: res.languageCode, transcriptionId: res.transcriptionId ?? null, model: sttModel() } };
    } catch (err) {
      const d = describeElevenLabsError(err);
      throw Object.assign(new Error(d.message), { retryable: d.retryable, status: d.status });
    }
  }
}

export async function testElevenLabs(purpose: string): Promise<ConnectionTest> {
  const testedAt = new Date().toISOString();
  const missing = missingVars("elevenlabs");
  if (missing.length) return { ok: false, message: `Missing environment variable: ${missing.join(", ")}`, testedAt };
  try {
    const user = await getElevenLabs().user.get({ timeoutInSeconds: 20 });
    const s = user.subscription;
    return {
      ok: true,
      message: `Authenticated for ${purpose}. Plan: ${s.tier}, ${s.characterCount.toLocaleString()} / ${s.characterLimit.toLocaleString()} characters used this cycle.`,
      details: { tier: s.tier, characterCount: s.characterCount, characterLimit: s.characterLimit, status: s.status },
      testedAt,
    };
  } catch (err) {
    return { ok: false, message: describeElevenLabsError(err).message, testedAt };
  }
}
