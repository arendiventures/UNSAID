import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ok, readJson, route } from "@/lib/api";
import { GuestInputSchema, createGuest, listGuests } from "@/lib/services/guests";

export const GET = route(async () => {
  const db = getDb();
  const guests = listGuests(db);
  const counts = db.all<{ guest_id: string; sources: number; passages: number }>(
    sql`select g.id as guest_id, (select count(*) from sources s where s.guest_id = g.id) as sources, (select count(*) from passages p where p.guest_id = g.id) as passages from guests g`,
  );
  const byId = new Map(counts.map((c) => [c.guest_id, c]));
  return ok(guests.map((g) => ({ ...g, sourceCount: byId.get(g.id)?.sources ?? 0, passageCount: byId.get(g.id)?.passages ?? 0 })));
});

export const POST = route(async (req: Request) => {
  const input = await readJson(req, GuestInputSchema);
  return ok(createGuest(getDb(), input), { status: 201 });
});
