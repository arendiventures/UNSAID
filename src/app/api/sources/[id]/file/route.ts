import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { storageDir } from "@/lib/config/env";
import { fail, route, type RouteCtx } from "@/lib/api";

/** Serves the original uploaded file from private storage (never from /public). */
export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const src = getDb().select().from(sources).where(eq(sources.id, id)).get();
  if (!src?.fileRef) return fail("No file for this source", 404);
  const abs = path.resolve(storageDir(), src.fileRef);
  if (!abs.startsWith(storageDir()) || !fs.existsSync(abs)) return fail("File missing from storage", 404);
  const data = fs.readFileSync(abs);
  const mime = src.mimeType === "application/pdf" ? "application/pdf" : "text/plain; charset=utf-8";
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": mime,
      "content-length": String(data.length),
      "content-disposition": `${src.mimeType === "application/pdf" ? "inline" : "attachment"}; filename="${encodeURIComponent(src.originalFilename ?? "source")}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
});
