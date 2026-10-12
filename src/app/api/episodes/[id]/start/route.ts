import { getDb } from "@/lib/db/client";
import { ok, route, type RouteCtx } from "@/lib/api";
import { startEpisode } from "@/lib/services/episodes";

export const POST = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return ok(startEpisode(getDb(), id));
});
