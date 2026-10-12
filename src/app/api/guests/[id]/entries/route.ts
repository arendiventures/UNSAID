import { getDb } from "@/lib/db/client";
import { fail, ok, readJson, route, type RouteCtx } from "@/lib/api";
import { EntryInputSchema, addEntry, getGuest, listEntries } from "@/lib/services/guests";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  return ok(listEntries(getDb(), id));
});

export const POST = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  if (!getGuest(db, id)) return fail("Guest not found", 404);
  const input = await readJson(req, EntryInputSchema);
  return ok(addEntry(db, id, input), { status: 201 });
});
