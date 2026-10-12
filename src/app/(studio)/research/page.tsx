import { getDb } from "@/lib/db/client";
import { listGuests } from "@/lib/services/guests";
import { sources } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { ResearchWorkbench } from "@/components/ResearchWorkbench";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const guests = listGuests(db);
  const all = db.select().from(sources).orderBy(desc(sources.createdAt)).all();
  const initialGuest = guests.find((g) => g.id === sp.guest || g.slug === sp.guest)?.id ?? guests[0]?.id ?? "";
  return <ResearchWorkbench guests={guests} initialSources={all} initialGuestId={initialGuest} />;
}
