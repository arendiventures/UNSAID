import { ok, route, type RouteCtx } from "@/lib/api";
import { cancelTurn } from "@/lib/engine/run";

export const POST = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return ok({ cancelled: cancelTurn(id) });
});
