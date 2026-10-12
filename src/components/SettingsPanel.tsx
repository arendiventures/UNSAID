"use client";

import { useState } from "react";
import type { ProviderInfo, ConnectionTest } from "@/lib/providers/types";
import type { ProviderCheck } from "@/lib/db/schema";
import { api } from "@/lib/client";
import { Badge, Card, Notice, fmtDate } from "./ui";

type Row = ProviderInfo & { lastCheck: ProviderCheck | null };

export function SettingsPanel({ providers, defaultLlmId, runtime }: { providers: Row[]; defaultLlmId: string; runtime: { storageDir: string; dbPath: string; maxUploadMb: number; authRequired: boolean; llmModel: string } }) {
  const [rows, setRows] = useState(providers);
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, ConnectionTest>>({});

  async function test(id: string) {
    setTesting(id);
    try {
      const r = await api<ConnectionTest>(`/api/providers/${id}/test`, { method: "POST" });
      setResult((m) => ({ ...m, [id]: r }));
      const fresh = await api<{ providers: Row[] }>("/api/providers");
      setRows(fresh.providers);
    } catch (e) {
      setResult((m) => ({ ...m, [id]: { ok: false, message: e instanceof Error ? e.message : "Test failed", testedAt: new Date().toISOString() } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="eyebrow">Settings</div>
        <h1 className="display text-4xl font-semibold">Integrations and runtime</h1>
        <p className="mt-2 text-sm text-ivory-dim">Credentials live only in <code className="font-mono">.env.local</code> on the server. This page reports presence, never values.</p>
      </header>

      <Notice tone={runtime.authRequired ? "ok" : "warn"}>
        {runtime.authRequired ? "Access token configured: every page and API route requires login." : "No STUDIO_ACCESS_TOKEN set. The app only answers loopback requests (127.0.0.1). Set a token before exposing it on any network."}
      </Notice>

      <div className="space-y-4">
        {rows.map((p) => {
          const r = result[p.id];
          return (
            <Card key={p.id} eyebrow={p.category.toUpperCase()} title={p.name} actions={
              <div className="flex items-center gap-2">
                {!p.implemented ? <Badge>Planned</Badge> : p.configured ? <Badge tone="ok">Configured</Badge> : <Badge tone="warn">Not configured</Badge>}
                {p.id === defaultLlmId && <Badge tone="amber">Default</Badge>}
                {p.implemented && <button className="btn btn-sm" disabled={testing === p.id} onClick={() => test(p.id)}>{testing === p.id ? "Testing…" : "Test connection"}</button>}
              </div>
            }>
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div className="space-y-2">
                  {p.missingEnv.length > 0 && <p className="text-warn">Missing: <span className="font-mono">{p.missingEnv.join(", ")}</span></p>}
                  {Object.keys(p.selection).length > 0 && (
                    <dl className="space-y-1">{Object.entries(p.selection).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="eyebrow w-24">{k}</dt><dd className="font-mono text-xs text-ivory-dim">{v ?? "-"}</dd></div>)}</dl>
                  )}
                  <ul className="space-y-1 text-xs text-ivory-mute">{p.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                  {p.docsUrl && <a className="text-xs text-amber-bright hover:underline" href={p.docsUrl} target="_blank" rel="noopener noreferrer">Documentation ↗</a>}
                </div>
                <div className="space-y-2">
                  {p.capabilities.length > 0 && (
                    <ul className="space-y-1">
                      {p.capabilities.map((c) => (
                        <li key={c.key} className="flex items-center justify-between gap-2 text-xs"><span className="text-ivory-dim">{c.label}</span><Badge tone={c.supported === true ? "ok" : c.supported === "unverified" ? "warn" : "default"}>{c.supported === true ? "supported" : c.supported === "unverified" ? "unverified" : "not supported"}</Badge></li>
                      ))}
                    </ul>
                  )}
                  {(r || p.lastCheck) && (
                    <div className={`rounded border px-3 py-2 text-xs ${(r ? r.ok : p.lastCheck?.ok) ? "border-ok/40 text-ok" : "border-danger/40 text-danger"}`}>
                      <div className="eyebrow mb-1 text-current">Connection test · {fmtDate(r?.testedAt ?? p.lastCheck?.lastTestAt)}</div>
                      {r?.message ?? p.lastCheck?.message}
                    </div>
                  )}
                  {p.lastCheck?.lastError && !(r?.ok) && <p className="text-xs text-ivory-mute">Last error ({fmtDate(p.lastCheck.lastErrorAt)}): {p.lastCheck.lastError}</p>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card eyebrow="Runtime" title="Local configuration">
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div><dt className="eyebrow">Storage directory</dt><dd className="font-mono text-xs text-ivory-dim">{runtime.storageDir}</dd></div>
          <div><dt className="eyebrow">Database</dt><dd className="font-mono text-xs text-ivory-dim">{runtime.dbPath}</dd></div>
          <div><dt className="eyebrow">Upload limit</dt><dd className="text-ivory-dim">{runtime.maxUploadMb} MB (UNSAID_MAX_UPLOAD_MB)</dd></div>
          <div><dt className="eyebrow">LLM model</dt><dd className="font-mono text-xs text-ivory-dim">{runtime.llmModel} (UNSAID_LLM_MODEL)</dd></div>
        </dl>
        <p className="mt-3 text-xs text-ivory-mute">Media services without an API (editing suites, hosting) are handled by manual export/import: download files from Episodes, upload results in Assets.</p>
      </Card>
    </div>
  );
}
