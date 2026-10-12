import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getGuest, listEntries, listVersions } from "@/lib/services/guests";
import { listAssets } from "@/lib/services/assets";
import { GuestEditor } from "@/components/GuestEditor";

export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const guest = getGuest(db, id);
  if (!guest) notFound();
  const entries = listEntries(db, guest.id);
  const versions = listVersions(db, guest.id);
  const assets = listAssets(db).filter((a) => a.guestId === guest.id);
  return <GuestEditor initialGuest={guest} initialEntries={entries} initialVersions={versions} assets={assets} />;
}
