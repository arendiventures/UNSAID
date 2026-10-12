import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { passages, sources } from "@/lib/db/schema";
import { fail, ok, readJson, route, type RouteCtx } from "@/lib/api";
import { deleteSource, SourceReviewSchema, updateSource } from "@/lib/research/ingest";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  const source = db.select().from(sources).where(eq(sources.id, id)).get();
  if (!source) return fail("Source not found", 404);
  const rows = db.select().from(passages).where(eq(passages.sourceId, id)).orderBy(asc(passages.seq)).all();
  return ok({ source, passages: rows });
});

export const PATCH = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const patch = await readJson(req, SourceReviewSchema);
  const src = updateSource(getDb(), id, patch);
  return src ? ok(src) : fail("Source not found", 404);
});

export const DELETE = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return deleteSource(getDb(), id) ? ok({ ok: true }) : fail("Source not found", 404);
});
