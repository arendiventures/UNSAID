import { getDb } from "@/lib/db/client";
import { providerChecks } from "@/lib/db/schema";
import { listProviders, defaultLlmId } from "@/lib/providers/registry";
import { appConfig, storageDir, dbPath } from "@/lib/config/env";
import { authRequired } from "@/lib/auth";
import { SettingsPanel } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const db = getDb();
  const checks = db.select().from(providerChecks).all();
  const byId = new Map(checks.map((c) => [c.provider, c]));
  const providers = listProviders().map((p) => ({ ...p, lastCheck: byId.get(p.id) ?? null }));
  return (
    <SettingsPanel
      providers={providers}
      defaultLlmId={defaultLlmId()}
      runtime={{
        storageDir: storageDir(),
        dbPath: dbPath(),
        maxUploadMb: Math.round(appConfig.maxUploadBytes / 1024 / 1024),
        authRequired: authRequired(),
        llmModel: appConfig.llmModel,
      }}
    />
  );
}
