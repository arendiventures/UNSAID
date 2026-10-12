import { ok, route, type RouteCtx } from "@/lib/api";
import { cancelEpisodeTurns } from "@/lib/engine/run";

/** Stop: aborts any in-flight generation for the episode. Playback stop is client-side. */
export const POST = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return ok({ cancelled: cancelEpisodeTurns(id) });
});
