import { getDb } from "@/lib/db/client";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { endEpisode } from "@/lib/services/episodes";
import { cancelEpisodeTurns } from "@/lib/engine/run";

export const POST = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  cancelEpisodeTurns(id);
  const ep = endEpisode(getDb(), id);
  return ep ? ok(ep) : fail("Episode not found", 404);
});
