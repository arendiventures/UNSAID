import { getDb } from "@/lib/db/client";
import { ok, route, type RouteCtx } from "@/lib/api";
import { listVersions } from "@/lib/services/guests";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return ok(listVersions(getDb(), id));
});
