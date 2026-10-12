import { getDb } from "@/lib/db/client";
import { fail, route, type RouteCtx } from "@/lib/api";
import { getEpisode, listTurns } from "@/lib/services/episodes";
import { getGuest } from "@/lib/services/guests";
import { reviewNotesMarkdown, sessionJson, transcriptMarkdown } from "@/lib/export/transcript";

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "episode";
}

export const GET = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const db = getDb();
  const episode = getEpisode(db, id);
  if (!episode) return fail("Episode not found", 404);
  const guest = getGuest(db, episode.guestId)!;
  const turns = listTurns(db, id);
  const u = new URL(req.url);
  const format = u.searchParams.get("format") ?? "markdown";
  const base = `unsaid-${slug(episode.title)}`;
  const bundle = { episode, guest, turns };
  const headers = (name: string, type: string) => ({ "content-type": type, "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" });
  if (format === "json") return new Response(JSON.stringify(sessionJson(bundle), null, 2), { headers: headers(`${base}.json`, "application/json") });
  if (format === "review") return new Response(reviewNotesMarkdown(bundle), { headers: headers(`${base}-review-notes.md`, "text/markdown; charset=utf-8") });
  const includeProducer = u.searchParams.get("producer") === "1";
  return new Response(transcriptMarkdown(bundle, { includeProducer }), { headers: headers(`${base}${includeProducer ? "-producer" : ""}-transcript.md`, "text/markdown; charset=utf-8") });
});
