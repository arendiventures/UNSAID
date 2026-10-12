import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { passages, sources } from "@/lib/db/schema";
import { getGuest } from "@/lib/services/guests";
import { SourceDetail } from "@/components/SourceDetail";

export const dynamic = "force-dynamic";

export default async function SourcePage({ params, searchParams }: { params: Promise<{ sourceId: string }>; searchParams: Promise<{ q?: string; passage?: string }> }) {
  const { sourceId } = await params;
  const sp = await searchParams;
  const db = getDb();
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) notFound();
  const guest = getGuest(db, source.guestId);
  const rows = db.select().from(passages).where(eq(passages.sourceId, sourceId)).orderBy(asc(passages.seq)).all();
  return <SourceDetail source={source} passages={rows} guestName={guest?.displayName ?? "?"} highlight={sp.q ?? ""} focusPassage={sp.passage ?? ""} />;
}
