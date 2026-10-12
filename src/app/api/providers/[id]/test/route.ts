import { getDb } from "@/lib/db/client";
import { providerChecks } from "@/lib/db/schema";
import { fail, ok, route, type RouteCtx } from "@/lib/api";
import { llmAdapters } from "@/lib/providers/registry";

export const POST = route(async (_req: Request, ctx: RouteCtx<{ id: string }>) => {
  const { id } = await ctx.params;
  const adapter = llmAdapters[id];
  if (!adapter) return fail("No implemented adapter with that id; nothing to test.", 404);
  const result = await adapter.test();
  const db = getDb();
  db.insert(providerChecks)
    .values({ provider: id, lastTestAt: result.testedAt, ok: result.ok, message: result.message, details: result.details ?? null, lastError: result.ok ? null : result.message, lastErrorAt: result.ok ? null : result.testedAt })
    .onConflictDoUpdate({
      target: providerChecks.provider,
      set: { lastTestAt: result.testedAt, ok: result.ok, message: result.message, details: result.details ?? null, ...(result.ok ? {} : { lastError: result.message, lastErrorAt: result.testedAt }) },
    })
    .run();
  return ok(result);
});
