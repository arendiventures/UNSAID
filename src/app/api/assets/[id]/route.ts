import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { fail, ok, readJson, route, type RouteCtx } from "@/lib/api";
import { deleteAsset, setAssetApproval } from "@/lib/services/assets";

export const PATCH = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const body = await readJson(req, z.object({ approvalStatus: z.enum(["pending", "approved", "rejected"]), notes: z.string().max(2000).optional() }));
  const a = setAssetApproval(getDb(), id, body.approvalStatus, body.notes);
  return a ? ok(a) : fail("Asset not found", 404);
});

export const DELETE = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return deleteAsset(getDb(), id) ? ok({ ok: true }) : fail("Asset not found", 404);
});
