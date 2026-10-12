import { getDb } from "@/lib/db/client";
import { listGuests } from "@/lib/services/guests";
import { listEpisodes } from "@/lib/services/episodes";
import { modeAvailability, defaultLlmId } from "@/lib/providers/registry";
import { RemoteHome } from "@/components/RemoteHome";

export const dynamic = "force-dynamic";

export default function RemotePage() {
  const db = getDb();
  const live = listEpisodes(db).filter((e) => e.episode.status === "live").map((e) => ({ id: e.episode.id, title: e.episode.title, guestName: e.guestName, mode: e.episode.mode, turnCount: e.turnCount }));
  return <RemoteHome guests={listGuests(db).map((g) => ({ id: g.id, displayName: g.displayName }))} live={live} modes={modeAvailability()} defaultLlmId={defaultLlmId()} />;
}
