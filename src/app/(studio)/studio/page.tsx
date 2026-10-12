import { getDb } from "@/lib/db/client";
import { listGuests } from "@/lib/services/guests";
import { listAssets } from "@/lib/services/assets";
import { listProviders, defaultLlmId } from "@/lib/providers/registry";
import { getEpisode, listTurns } from "@/lib/services/episodes";
import { getGuest } from "@/lib/services/guests";
import { isEpisodeBusy } from "@/lib/engine/run";
import { getLlm } from "@/lib/providers/registry";
import { InterviewStudio, type EpisodeBundle } from "@/components/InterviewStudio";

export const dynamic = "force-dynamic";

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ episode?: string; guest?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const guests = listGuests(db);
  const assets = listAssets(db);
  let initial: EpisodeBundle | null = null;
  if (sp.episode) {
    const episode = getEpisode(db, sp.episode);
    if (episode) {
      const guest = getGuest(db, episode.guestId)!;
      initial = { episode, guest, turns: listTurns(db, episode.id), busy: isEpisodeBusy(episode), provider: getLlm(episode.llmProvider).info() };
    }
  }
  return (
    <InterviewStudio
      guests={guests}
      providers={listProviders().filter((p) => p.category === "llm" && p.implemented)}
      defaultLlmId={defaultLlmId()}
      conceptImages={Object.fromEntries(assets.filter((a) => a.kind === "guest_concept_image" && a.guestId).map((a) => [a.guestId!, a.id]))}
      backdropId={assets.find((a) => a.kind === "studio_backdrop")?.id ?? null}
      initialEpisode={initial}
      initialGuestId={sp.guest ?? null}
    />
  );
}
