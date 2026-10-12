import { getDb } from "@/lib/db/client";
import { appConfig } from "@/lib/config/env";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { getEpisode } from "@/lib/services/episodes";
import { getStt } from "@/lib/providers/registry";
import { ALLOWED_AUDIO_UPLOADS } from "@/lib/services/speech";

export const maxDuration = 120;

/** Push-to-talk clip → text. Does not create a turn; the host confirms (or auto-asks) client-side. */
export const POST = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const episode = getEpisode(getDb(), id);
  if (!episode) return fail("Episode not found", 404);
  if (episode.status !== "live") return fail("Session is not live.", 409);
  const stt = getStt();
  const info = stt.info();
  if (!info.configured) return fail(`Speech-to-text is not configured (missing ${info.missingEnv.join(", ")}).`, 409, { missingEnv: info.missingEnv });
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return fail("No audio received.");
  const mime = (audio.type || String(form.get("mimeType") ?? "")).split(";")[0]!.trim();
  if (!ALLOWED_AUDIO_UPLOADS.has(mime)) return fail(`Unsupported audio type ${mime || "(unknown)"}.`, 415);
  if (audio.size > appConfig.maxUploadBytes) return fail("Audio clip is too large.", 413);
  const started = Date.now();
  try {
    const result = await stt.transcribe(Buffer.from(await audio.arrayBuffer()), mime, req.signal);
    return ok({ text: result.text, provider: stt.id, model: info.selection.model, durationMs: Date.now() - started, meta: result.raw ?? null, bytes: audio.size });
  } catch (err) {
    const e = err as Error & { status?: number; retryable?: boolean };
    return fail(e.message, 502, { retryable: !!e.retryable, providerStatus: e.status ?? null });
  }
});
