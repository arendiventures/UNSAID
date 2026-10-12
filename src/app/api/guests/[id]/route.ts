import { getDb } from "@/lib/db/client";
import { fail, ok, readJson, route, type RouteCtx } from "@/lib/api";
import { GuestPatchSchema, deleteGuest, getGuest, listEntries, listVersions, updateGuest } from "@/lib/services/guests";

export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  const guest = getGuest(db, id);
  if (!guest) return fail("Guest not found", 404);
  return ok({ guest, entries: listEntries(db, guest.id), versions: listVersions(db, guest.id) });
});

export const PATCH = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const patch = await readJson(req, GuestPatchSchema);
  const g = updateGuest(getDb(), id, patch);
  return g ? ok(g) : fail("Guest not found", 404);
});

export const DELETE = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const res = deleteGuest(getDb(), id);
  if (!res.ok) return fail(res.reason ?? "Guest not found", res.reason ? 409 : 404);
  return ok({ ok: true });
});
