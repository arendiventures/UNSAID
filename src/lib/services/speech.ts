import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { episodes, guests, turns, type Asset, type Turn } from "@/lib/db/schema";
import { EngineError } from "@/lib/engine/run";
import type { TtsAdapter } from "@/lib/providers/types";
import { defaultVoiceId, STOCK_VOICE_CATEGORIES } from "@/lib/providers/tts/elevenlabs";
import { registerAsset, getAsset } from "./assets";
import { claimJob, runJob } from "./jobs";

export type SpeakResult = { asset: Asset; cached: boolean; jobId: string | null; voiceId: string };

export const ALLOWED_AUDIO_UPLOADS = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac", "audio/flac"]);

/** Resolve the voice a guest may use: profile selection first, env fallback second. */
export function resolveVoice(db: Db, guestId: string): { voiceId: string; source: "guest" | "env" } | null {
  const g = db.select().from(guests).where(eq(guests.id, guestId)).get();
  const fromGuest = g?.voiceConfig?.provider === "elevenlabs" ? g.voiceConfig.voiceId?.trim() : undefined;
  if (fromGuest) return { voiceId: fromGuest, source: "guest" };
  const env = defaultVoiceId();
  return env ? { voiceId: env, source: "env" } : null;
}

/**
 * Synthesize a validated turn exactly once. Idempotent: an existing audio asset is returned
 * without a new paid request; concurrent calls share one job via the idempotency key.
 */
export async function speakTurn(db: Db, turnId: string, tts: TtsAdapter, opts: { voiceId?: string } = {}): Promise<SpeakResult> {
  const turn = db.select().from(turns).where(eq(turns.id, turnId)).get();
  if (!turn) throw new EngineError("Turn not found.", 404);
  if (turn.state !== "ready" || !turn.spokenText) throw new EngineError("Only validated (ready) turns can be spoken.", 409);
  if (turn.audioAssetId) {
    const existing = getAsset(db, turn.audioAssetId);
    if (existing) return { asset: existing, cached: true, jobId: null, voiceId: "" };
  }
  const episode = db.select().from(episodes).where(eq(episodes.id, turn.episodeId)).get();
  if (!episode) throw new EngineError("Episode not found.", 404);
  const info = tts.info();
  if (!info.configured) throw new EngineError(`Text-to-speech is not configured (missing ${info.missingEnv.join(", ")}).`, 409);
  const voice = opts.voiceId ? { voiceId: opts.voiceId, source: "request" as const } : resolveVoice(db, episode.guestId);
  if (!voice) throw new EngineError("No voice selected. Choose a stock voice in the guest profile or set UNSAID_ELEVENLABS_VOICE_ID.", 409);

  // Refuse cloned / celebrity voices unless the guest has documented verified consent.
  const guest = db.select().from(guests).where(eq(guests.id, episode.guestId)).get()!;
  const voices = await tts.listVoices().catch(() => []);
  const match = voices.find((v) => v.voiceId === voice.voiceId);
  if (match && !STOCK_VOICE_CATEGORIES.has(match.category)) {
    const consent = guest.voiceConfig?.kind === "custom" && guest.voiceConfig?.consentStatus === "verified";
    if (!consent) throw new EngineError(`Voice "${match.name}" is category "${match.category}". Non-stock voices require a custom voice configuration with verified consent on the guest profile.`, 403);
  }

  const { job, created } = claimJob(db, { type: "tts", idempotencyKey: `tts:${turn.id}`, provider: tts.id, input: { turnId: turn.id, voiceId: voice.voiceId, characters: turn.spokenText.length }, timeoutMs: 120_000, maxAttempts: 2 });
  if (!created && job.status === "running") throw new EngineError("Synthesis for this turn is already in progress.", 409);
  if (!created && job.status === "completed" && typeof job.result?.assetId === "string") {
    const a = getAsset(db, job.result.assetId);
    if (a) return { asset: a, cached: true, jobId: job.id, voiceId: voice.voiceId };
  }
  if (!created && job.status === "failed" && job.attempts >= job.maxAttempts) throw new EngineError(`Synthesis failed ${job.attempts} time(s): ${job.error}. Not retrying automatically.`, 502);

  const out = await runJob(db, job, async (signal) => {
    const { audio, mimeType, raw } = await tts.synthesize(turn.spokenText!, voice.voiceId, signal);
    const asset = registerAsset(db, { kind: "audio", data: audio, filename: `turn-${turn.seq}.mp3`, mimeType, label: `Guest audio - turn ${turn.seq}`, guestId: episode.guestId, episodeId: episode.id, approvalStatus: "approved", notes: `voice ${voice.voiceId}` });
    db.update(turns).set({ audioAssetId: asset.id }).where(eq(turns.id, turn.id)).run();
    return { assetId: asset.id, bytes: audio.length, voiceId: voice.voiceId, raw: raw ?? null } as Record<string, unknown>;
  });
  if (!out.ok) throw new EngineError(`Speech synthesis failed: ${out.error}`, 502);
  return { asset: getAsset(db, String(out.result.assetId))!, cached: false, jobId: job.id, voiceId: voice.voiceId };
}

export function turnAudioUrl(t: Pick<Turn, "audioAssetId">): string | null {
  return t.audioAssetId ? `/api/assets/${t.audioAssetId}/file` : null;
}
