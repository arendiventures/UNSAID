import { AnthropicLlmAdapter } from "./llm/anthropic";
import { LocalEvidenceReader, LOCAL_READER_ID } from "./llm/local";
import { ElevenLabsSttAdapter } from "./stt/elevenlabs";
import { ElevenLabsTtsAdapter } from "./tts/elevenlabs";
import type { LlmAdapter, ProviderInfo, SttAdapter, TtsAdapter } from "./types";

const anthropic = new AnthropicLlmAdapter();
const local = new LocalEvidenceReader();
const stt = new ElevenLabsSttAdapter();
const tts = new ElevenLabsTtsAdapter();

export const llmAdapters: Record<string, LlmAdapter> = { [anthropic.id]: anthropic, [local.id]: local };
export const sttAdapters: Record<string, SttAdapter> = { [stt.id]: stt };
export const ttsAdapters: Record<string, TtsAdapter> = { [tts.id]: tts };

/** The adapter the studio uses by default: Claude when configured, otherwise the offline reader. */
export function defaultLlmId(): string {
  return anthropic.info().configured ? anthropic.id : LOCAL_READER_ID;
}

export function getLlm(id?: string | null): LlmAdapter {
  if (id && llmAdapters[id]) return llmAdapters[id]!;
  return llmAdapters[defaultLlmId()]!;
}

export function getStt(): SttAdapter {
  return stt;
}

export function getTts(): TtsAdapter {
  return tts;
}

export function anyAdapter(id: string): LlmAdapter | SttAdapter | TtsAdapter | undefined {
  return llmAdapters[id] ?? sttAdapters[id] ?? ttsAdapters[id];
}

/** Which interview modes have working dependencies right now. */
export function modeAvailability() {
  const sttInfo = stt.info();
  const ttsInfo = tts.info();
  const audioMissing = [...new Set([...sttInfo.missingEnv, ...ttsInfo.missingEnv])];
  return {
    text: { available: true as const, reason: "" },
    audio: { available: sttInfo.configured && ttsInfo.configured, reason: audioMissing.length ? `Needs ${audioMissing.join(", ")} (speech-to-text and text-to-speech).` : "" },
    avatar: { available: false as const, reason: "Live avatar is Milestone 3; no provider is wired yet." },
  };
}

/**
 * Honest inventory. Categories without an implemented adapter are listed as planned
 * so the settings page never implies a working integration that does not exist.
 */
export function listProviders(): ProviderInfo[] {
  return [
    anthropic.info(),
    local.info(),
    stt.info(),
    tts.info(),
    {
      id: "avatar",
      category: "avatar",
      name: "Live avatar",
      implemented: false,
      configured: false,
      missingEnv: [],
      selection: {},
      capabilities: [],
      notes: ["Milestone 3. Tavus / HeyGen to be evaluated against current docs. Until then the studio shows the static concept image labelled 'static preview'."],
    },
  ];
}
