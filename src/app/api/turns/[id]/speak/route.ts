import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ok, route, type RouteCtx } from "@/lib/api";
import { getTts } from "@/lib/providers/registry";
import { speakTurn } from "@/lib/services/speech";

export const maxDuration = 150;

const Body = z.object({ voiceId: z.string().max(100).optional() });

/** Synthesize a validated turn once and return the stored audio asset. */
export const POST = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const text = await req.text();
  const body = text ? Body.parse(JSON.parse(text)) : {};
  const r = await speakTurn(getDb(), id, getTts(), { voiceId: body.voiceId });
  return ok({ assetId: r.asset.id, url: `/api/assets/${r.asset.id}/file`, mimeType: r.asset.mimeType, bytes: r.asset.size, cached: r.cached, jobId: r.jobId, voiceId: r.voiceId });
});
