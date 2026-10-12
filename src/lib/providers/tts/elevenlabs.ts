import { missingVars } from "@/lib/config/env";
import type { ConnectionTest, ProviderInfo, TtsAdapter, VoiceOption } from "../types";
import { describeElevenLabsError, getElevenLabs } from "../elevenlabs/client";
import { testElevenLabs } from "../stt/elevenlabs";

export const ELEVENLABS_TTS_ID = "elevenlabs-tts";
const OUTPUT_FORMAT = "mp3_44100_128" as const;
const MAX_CHARS = 5000; // well under the documented 10k per-request ceiling; spoken answers are short

export function ttsModel(): string {
  return process.env.UNSAID_TTS_MODEL?.trim() || "eleven_multilingual_v2";
}

export function defaultVoiceId(): string | null {
  return process.env.UNSAID_ELEVENLABS_VOICE_ID?.trim() || null;
}

/** Stock categories a guest may use without documented consent. Cloned/famous voices are refused. */
export const STOCK_VOICE_CATEGORIES = new Set(["premade", "generated", "professional", "high_quality"]);

let voiceCache: { at: number; voices: VoiceOption[] } | null = null;

export class ElevenLabsTtsAdapter implements TtsAdapter {
  readonly id = ELEVENLABS_TTS_ID;

  info(): ProviderInfo {
    const missing = missingVars("elevenlabs");
    return {
      id: this.id,
      category: "tts",
      name: "ElevenLabs (text-to-speech)",
      implemented: true,
      configured: missing.length === 0,
      missingEnv: missing,
      selection: { model: ttsModel(), outputFormat: OUTPUT_FORMAT, defaultVoiceId: defaultVoiceId() ?? "(per guest)" },
      capabilities: [
        { key: "synthesize", label: "Synthesize validated answers to MP3", supported: true },
        { key: "stock_voices", label: "Stock voice library", supported: true },
        { key: "cloned_voices", label: "Cloned or celebrity voices", supported: false, note: "Refused by this app unless a guest has documented, verified consent" },
        { key: "streaming", label: "Streaming playback before synthesis completes", supported: false, note: "Not implemented; answers are synthesized then played" },
        { key: "cancellation", label: "Cancel an in-flight request", supported: true },
      ],
      notes: ["Set ELEVENLABS_API_KEY in .env.local. Model from UNSAID_TTS_MODEL (default eleven_multilingual_v2).", "Pick a stock voice per guest in the guest profile, or set UNSAID_ELEVENLABS_VOICE_ID as the fallback.", "Each synthesis spends ElevenLabs characters; audio is stored once per turn and replayed from storage."],
      docsUrl: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
    };
  }

  async test(): Promise<ConnectionTest> {
    const base = await testElevenLabs("text-to-speech");
    if (!base.ok) return base;
    try {
      const voices = await this.listVoices(true);
      return { ...base, message: `${base.message} ${voices.length} voice(s) visible.`, details: { ...base.details, voices: voices.length } };
    } catch (err) {
      return { ok: false, message: `Authenticated but listing voices failed: ${describeElevenLabsError(err).message}`, testedAt: base.testedAt };
    }
  }

  async listVoices(refresh = false): Promise<VoiceOption[]> {
    if (!refresh && voiceCache && Date.now() - voiceCache.at < 10 * 60_000) return voiceCache.voices;
    const res = await getElevenLabs().voices.search({ pageSize: 100 }, { timeoutInSeconds: 30 });
    const voices: VoiceOption[] = res.voices.map((v) => ({
      voiceId: v.voiceId,
      name: v.name ?? v.voiceId,
      category: v.category ?? "unknown",
      labels: v.labels ?? {},
      previewUrl: v.previewUrl ?? null,
      stock: STOCK_VOICE_CATEGORIES.has(v.category ?? ""),
    }));
    voiceCache = { at: Date.now(), voices };
    return voices;
  }

  async synthesize(text: string, voiceId: string, signal?: AbortSignal) {
    const clean = text.trim();
    if (!clean) throw new Error("Nothing to synthesize.");
    if (clean.length > MAX_CHARS) throw new Error(`Spoken text is ${clean.length} characters; the limit per synthesis is ${MAX_CHARS}.`);
    try {
      const stream = await getElevenLabs().textToSpeech.convert(voiceId, { text: clean, modelId: ttsModel(), outputFormat: OUTPUT_FORMAT }, { abortSignal: signal, timeoutInSeconds: 120 });
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const audio = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      if (audio.length === 0) throw new Error("ElevenLabs returned empty audio.");
      return { audio, mimeType: "audio/mpeg", raw: { model: ttsModel(), outputFormat: OUTPUT_FORMAT, characters: clean.length } };
    } catch (err) {
      const d = describeElevenLabsError(err);
      throw Object.assign(new Error(d.message), { retryable: d.retryable, status: d.status });
    }
  }
}
