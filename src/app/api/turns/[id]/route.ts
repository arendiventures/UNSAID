import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { fail, ok, readJson, route, type RouteCtx } from "@/lib/api";
import { setTurnReview } from "@/lib/services/episodes";

export const PATCH = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const body = await readJson(req, z.object({ reviewFlag: z.boolean(), reviewNote: z.string().max(4000).optional() }));
  const t = setTurnReview(getDb(), id, body.reviewFlag, body.reviewNote);
  return t ? ok(t) : fail("Turn not found", 404);
});
