import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { passages, sources } from "@/lib/db/schema";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { deleteSource } from "@/lib/research/ingest";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  const source = db.select().from(sources).where(eq(sources.id, id)).get();
  if (!source) return fail("Source not found", 404);
  const rows = db.select().from(passages).where(eq(passages.sourceId, id)).orderBy(asc(passages.seq)).all();
  return ok({ source, passages: rows });
});

export const DELETE = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return deleteSource(getDb(), id) ? ok({ ok: true }) : fail("Source not found", 404);
});
