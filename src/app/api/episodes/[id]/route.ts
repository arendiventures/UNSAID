import { getDb } from "@/lib/db/client";
import { fail, ok, readJson, route, type RouteCtx } from "@/lib/api";
import { EpisodePatchSchema, deleteEpisode, getEpisode, listTurns, patchEpisode } from "@/lib/services/episodes";
import { getGuest } from "@/lib/services/guests";
import { isEpisodeBusy } from "@/lib/engine/run";
import { getLlm } from "@/lib/providers/registry";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  const episode = getEpisode(db, id);
  if (!episode) return fail("Episode not found", 404);
  const guest = getGuest(db, episode.guestId);
  return ok({ episode, guest, turns: listTurns(db, id), busy: isEpisodeBusy(episode), provider: getLlm(episode.llmProvider).info() });
});

export const PATCH = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const patch = await readJson(req, EpisodePatchSchema);
  const ep = patchEpisode(getDb(), id, patch);
  return ep ? ok(ep) : fail("Episode not found", 404);
});

export const DELETE = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return deleteEpisode(getDb(), id) ? ok({ ok: true }) : fail("Episode not found", 404);
});
