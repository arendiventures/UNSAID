import { getDb } from "@/lib/db/client";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { deleteEntry } from "@/lib/services/guests";

export const DELETE = route(async (_req: Request, ctx: RouteCtx<{ id: string; entryId: string }>) => {
  const { id, entryId } = await ctx.params;
  return deleteEntry(getDb(), id, entryId) ? ok({ ok: true }) : fail("Entry not found", 404);
});
