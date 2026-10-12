import fs from "node:fs";
import { getDb } from "@/lib/db/client";
import { fail, route, type RouteCtx } from "@/lib/api";
import { assetAbsolutePath, getAsset } from "@/lib/services/assets";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const a = getAsset(getDb(), id);
  const abs = a ? assetAbsolutePath(a) : null;
  if (!a || !abs) return fail("Asset not found", 404);
  const data = fs.readFileSync(abs);
  return new Response(new Uint8Array(data), {
    headers: { "content-type": a.mimeType, "content-length": String(data.length), "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600", etag: `"${a.sha256.slice(0, 16)}"` },
  });
});
