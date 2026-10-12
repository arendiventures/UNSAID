import { getDb } from "@/lib/db/client";
import { ok, readJson, route } from "@/lib/api";
import { EpisodeInputSchema, createEpisode, listEpisodes } from "@/lib/services/episodes";

export const GET = route(async () => ok(listEpisodes(getDb())));

export const POST = route(async (req: Request) => {
  const input = await readJson(req, EpisodeInputSchema);
  return ok(createEpisode(getDb(), input), { status: 201 });
});
