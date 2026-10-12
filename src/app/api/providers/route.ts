import { getDb } from "@/lib/db/client";
import { providerChecks } from "@/lib/db/schema";
import { ok, route } from "@/lib/api";
import { defaultLlmId, listProviders } from "@/lib/providers/registry";

export const GET = route(async () => {
  const checks = getDb().select().from(providerChecks).all();
  const byId = new Map(checks.map((c) => [c.provider, c]));
  return ok({ defaultLlmId: defaultLlmId(), providers: listProviders().map((p) => ({ ...p, lastCheck: byId.get(p.id) ?? null })) });
});
