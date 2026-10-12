import { z } from "zod";
import { ok, readJson, route, type RouteCtx } from "@/lib/api";
import { runTurn } from "@/lib/engine/run";

const AskSchema = z.object({
  question: z.string().min(1).max(4000),
  inputMode: z.enum(["typed", "voice"]).default("typed"),
  llmId: z.string().max(60).nullable().optional(),
});

export const maxDuration = 120;

export const POST = route(async (req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const body = await readJson(req, AskSchema);
  const turn = await runTurn({ episodeId: id, question: body.question, inputMode: body.inputMode, llmId: body.llmId ?? null });
  return ok(turn, { status: 201 });
});
