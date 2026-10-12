import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getEpisode, listTurns } from "@/lib/services/episodes";
import { getGuest } from "@/lib/services/guests";
import { EpisodeDetail } from "@/components/EpisodeDetail";

export const dynamic = "force-dynamic";

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const episode = getEpisode(db, id);
  if (!episode) notFound();
  const guest = getGuest(db, episode.guestId)!;
  return <EpisodeDetail episode={episode} guest={guest} turns={listTurns(db, id)} />;
}
