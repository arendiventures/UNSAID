import { getSqlite } from "@/lib/db/client";
import { fail, ok, route } from "@/lib/api";
import { searchPassages } from "@/lib/research/retrieval";

export const GET = route(async (req: Request) => {
  const u = new URL(req.url);
  const guestId = u.searchParams.get("guestId");
  const q = u.searchParams.get("q") ?? "";
  if (!guestId) return fail("guestId is required");
  const limit = Number(u.searchParams.get("limit") ?? 12);
  return ok(searchPassages(getSqlite(), guestId, q, { limit: Number.isFinite(limit) ? limit : 12 }));
});
