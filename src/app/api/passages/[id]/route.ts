import { getSqlite } from "@/lib/db/client";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { getPassagesByIds } from "@/lib/research/retrieval";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const [p] = getPassagesByIds(getSqlite(), [id]);
  return p ? ok(p) : fail("Passage not found", 404);
});
