import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getEpisode, listTurns } from "@/lib/services/episodes";
import { getGuest } from "@/lib/services/guests";
import { listAssets } from "@/lib/services/assets";
import { modeAvailability, getTts } from "@/lib/providers/registry";
import { RemoteStudio } from "@/components/RemoteStudio";

export const dynamic = "force-dynamic";

export default async function RemoteEpisodePage({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  const db = getDb();
  const episode = getEpisode(db, episodeId);
  if (!episode) notFound();
  const guest = getGuest(db, episode.guestId)!;
  const concept = listAssets(db).find((a) => a.kind === "guest_concept_image" && a.guestId === guest.id);
  return <RemoteStudio episode={episode} guest={guest} initialTurns={listTurns(db, episodeId)} conceptAssetId={concept?.id ?? null} pttAvailable={modeAvailability().audio.available} pttReason={modeAvailability().audio.reason} ttsConfigured={getTts().info().configured} />;
}
