import type { GuestResponse } from "@/lib/engine/schema";
import type { TurnUsage } from "@/lib/db/schema";

export type ProviderCategory = "llm" | "stt" | "tts" | "avatar";

export type ProviderCapability = { key: string; label: string; supported: boolean | "unverified"; note?: string };

export type ProviderInfo = {
  id: string;
  category: ProviderCategory;
  name: string;
  implemented: boolean;
  configured: boolean;
  missingEnv: string[];
  selection: Record<string, string | undefined>;
  capabilities: ProviderCapability[];
  notes: string[];
  docsUrl?: string;
};

export type ConnectionTest = { ok: boolean; message: string; details?: Record<string, unknown>; testedAt: string };

export type LlmGenerateInput = {
  system: string;
  turns: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
};

export type LlmGenerateResult =
  | { kind: "ok"; raw: unknown; parsed: GuestResponse | null; model: string; usage: TurnUsage | null; latencyMs: number }
  | { kind: "refused"; reason: string; model: string; usage: TurnUsage | null; latencyMs: number }
  | { kind: "error"; message: string; retryable: boolean; latencyMs: number }
  | { kind: "cancelled"; latencyMs: number };

export interface LlmAdapter {
  readonly id: string;
  info(): ProviderInfo;
  test(): Promise<ConnectionTest>;
  generate(input: LlmGenerateInput): Promise<LlmGenerateResult>;
}

/** Milestone 2: implement one provider each. Interfaces only - no half-built integrations. */
export interface SttAdapter {
  readonly id: string;
  info(): ProviderInfo;
  test(): Promise<ConnectionTest>;
  transcribe(audio: Buffer, mimeType: string, signal?: AbortSignal): Promise<{ text: string; durationMs?: number; raw?: unknown }>;
}

export interface TtsAdapter {
  readonly id: string;
  info(): ProviderInfo;
  test(): Promise<ConnectionTest>;
  synthesize(text: string, voiceId: string, signal?: AbortSignal): Promise<{ audio: Buffer; mimeType: string; raw?: unknown }>;
}

/** Milestone 3: live or asynchronous avatar rendering. */
export interface AvatarAdapter {
  readonly id: string;
  info(): ProviderInfo;
  test(): Promise<ConnectionTest>;
}
