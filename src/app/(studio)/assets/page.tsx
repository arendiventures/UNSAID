import { getDb } from "@/lib/db/client";
import { listAssets } from "@/lib/services/assets";
import { listGuests } from "@/lib/services/guests";
import { AssetsManager } from "@/components/AssetsManager";

export const dynamic = "force-dynamic";

export default function AssetsPage() {
  const db = getDb();
  return <AssetsManager initialAssets={listAssets(db)} guests={listGuests(db)} />;
}
