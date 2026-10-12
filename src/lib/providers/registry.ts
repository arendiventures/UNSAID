import { AnthropicLlmAdapter } from "./llm/anthropic";
import { LocalEvidenceReader, LOCAL_READER_ID } from "./llm/local";
import type { LlmAdapter, ProviderInfo } from "./types";

const anthropic = new AnthropicLlmAdapter();
const local = new LocalEvidenceReader();

export const llmAdapters: Record<string, LlmAdapter> = {
  [anthropic.id]: anthropic,
  [local.id]: local,
};

/** The adapter the studio uses by default: Claude when configured, otherwise the offline reader. */
export function defaultLlmId(): string {
  return anthropic.info().configured ? anthropic.id : LOCAL_READER_ID;
}

export function getLlm(id?: string | null): LlmAdapter {
  if (id && llmAdapters[id]) return llmAdapters[id]!;
  return llmAdapters[defaultLlmId()]!;
}

/**
 * Honest inventory. Categories without an implemented adapter are listed as planned
 * so the settings page never implies a working integration that does not exist.
 */
export function listProviders(): ProviderInfo[] {
  return [
    anthropic.info(),
    local.info(),
    {
      id: "stt",
      category: "stt",
      name: "Speech-to-text",
      implemented: false,
      configured: false,
      missingEnv: [],
      selection: {},
      capabilities: [],
      notes: ["Milestone 2. Adapter interface defined in src/lib/providers/types.ts; no provider wired yet. Push-to-talk stays disabled until this exists."],
    },
    {
      id: "tts",
      category: "tts",
      name: "Text-to-speech",
      implemented: false,
      configured: false,
      missingEnv: [],
      selection: {},
      capabilities: [],
      notes: ["Milestone 2. Stock voices only until approved custom assets are supplied; no voice cloning of public figures."],
    },
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
