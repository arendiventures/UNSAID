import { getDb } from "@/lib/db/client";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { getEpisode, listTurns } from "@/lib/services/episodes";
import { getGuest } from "@/lib/services/guests";
import { findAsset } from "@/lib/services/assets";

/**
 * Audience-safe projection for the OBS capture view. Deliberately omits questions,
 * producer metadata, citations, errors, provider details and anything not meant on air.
 */
export const GET = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  const episode = getEpisode(db, id);
  if (!episode) return fail("Episode not found", 404);
  const guest = getGuest(db, episode.guestId)!;
  const turns = listTurns(db, id);
  const ready = turns.filter((t) => t.state === "ready" && t.spokenText);
  const latest = ready[ready.length - 1];
  const active = turns.find((t) => ["queued", "retrieving", "generating", "validating"].includes(t.state));
  const concept = findAsset(db, "guest_concept_image", guest.id);
  const backdrop = findAsset(db, "studio_backdrop");
  const logo = findAsset(db, "brand_logo");
  return ok({
    episodeTitle: episode.title,
    status: episode.status,
    guestName: guest.displayName,
    simulationLabel: guest.simulationLabel,
    guestBusy: !!active,
    latest: latest ? { id: latest.id, seq: latest.seq, spokenText: latest.spokenText, completedAt: latest.completedAt, audioAssetId: latest.audioAssetId ?? null } : null,
    mode: episode.mode,
    visuals: { conceptAssetId: concept?.id ?? null, backdropAssetId: backdrop?.id ?? null, logoAssetId: logo?.id ?? null, mode: "static_image" as const },
  });
});
