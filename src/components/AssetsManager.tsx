"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Asset, Guest } from "@/lib/db/schema";
import { ASSET_KINDS } from "@/lib/db/schema";
import { api } from "@/lib/client";
import { Badge, Card, Empty, Field, Notice } from "./ui";
import { Wordmark } from "./Wordmark";

const KIND_LABEL: Record<string, string> = { brand_logo: "Brand logo", studio_backdrop: "Studio backdrop", guest_concept_image: "Guest concept image", episode_thumbnail: "Episode thumbnail", audio: "Audio", video: "Video", other: "Other" };

export function AssetsManager({ initialAssets, guests }: { initialAssets: Asset[]; guests: Guest[] }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [kind, setKind] = useState<string>("brand_logo");
  const [guestId, setGuestId] = useState("");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const logo = assets.find((a) => a.kind === "brand_logo" && a.approvalStatus !== "rejected");

  async function refresh() {
    setAssets(await api<Asset[]>("/api/assets"));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="eyebrow">Assets</div>
        <h1 className="display text-4xl font-semibold">Brand and guest assets</h1>
        <p className="mt-2 max-w-2xl text-sm text-ivory-dim">Files are stored privately under the storage directory and served only through the app. Guest images are static stills with an approval status; nothing here is an animated avatar.</p>
      </header>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card eyebrow="Upload" title="Register an asset">
            <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (!file) return; setBusy(true); setMsg(null); const fd = new FormData(); fd.set("file", file); fd.set("kind", kind); fd.set("label", label); if (guestId) fd.set("guestId", guestId); try { await api("/api/assets", { method: "POST", body: fd }); setMsg({ tone: "ok", text: "Asset registered (pending approval)." }); setFile(null); setLabel(""); (e.target as HTMLFormElement).reset(); await refresh(); } catch (ex) { setMsg({ tone: "danger", text: ex instanceof Error ? ex.message : "Upload failed" }); } finally { setBusy(false); } }}>
              <Field label="Kind"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{ASSET_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}</select></Field>
              <Field label="Guest (for guest-specific assets)"><select className="input" value={guestId} onChange={(e) => setGuestId(e.target.value)}><option value="">— none (global) —</option>{guests.map((g) => <option key={g.id} value={g.id}>{g.displayName}</option>)}</select></Field>
              <Field label="Label"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
              <Field label="File" hint="PNG, JPEG, WebP, MP3, WAV, WebM, MP4."><input className="input" type="file" accept="image/png,image/jpeg,image/webp,audio/*,video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
              <button className="btn btn-primary w-full" disabled={busy || !file}>{busy ? "Uploading…" : "Upload"}</button>
            </form>
          </Card>
          <Card eyebrow="Wordmark" title="Current branding">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${logo.id}/file`} alt="UNSAID logo" className="w-full rounded bg-black/40 p-3" />
            ) : (
              <div className="space-y-3"><Wordmark size="md" /><p className="text-xs text-ivory-mute">No logo asset registered; this temporary CSS wordmark is used instead.</p></div>
            )}
          </Card>
        </div>
        <Card eyebrow="Library" title={`${assets.length} asset${assets.length === 1 ? "" : "s"}`}>
          {assets.length === 0 ? <Empty title="No assets yet" /> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {assets.map((a) => (
                <li key={a.id} className="rounded-lg border border-line bg-bg-elev p-3">
                  {a.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/assets/${a.id}/file`} alt="" className="mb-2 aspect-video w-full rounded object-cover" />
                  ) : a.mimeType.startsWith("audio/") ? (
                    <audio controls className="mb-2 w-full" src={`/api/assets/${a.id}/file`} />
                  ) : a.mimeType.startsWith("video/") ? (
                    <video controls className="mb-2 w-full rounded" src={`/api/assets/${a.id}/file`} />
                  ) : null}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm text-ivory">{a.label || a.originalFilename}</div>
                      <div className="text-xs text-ivory-mute">{KIND_LABEL[a.kind] ?? a.kind}{a.guestId ? ` · ${guests.find((g) => g.id === a.guestId)?.displayName ?? a.guestId}` : ""} · {a.width && a.height ? `${a.width}×${a.height} · ` : ""}{(a.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <Badge tone={a.approvalStatus === "approved" ? "ok" : a.approvalStatus === "rejected" ? "danger" : "warn"}>{a.approvalStatus}</Badge>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {(["approved", "pending", "rejected"] as const).filter((s) => s !== a.approvalStatus).map((s) => (
                      <button key={s} className="btn btn-ghost btn-sm" onClick={async () => { await api(`/api/assets/${a.id}`, { method: "PATCH", json: { approvalStatus: s } }); await refresh(); }}>{s}</button>
                    ))}
                    <button className="btn btn-ghost btn-sm text-danger" onClick={async () => { if (!confirm(`Delete asset "${a.label || a.originalFilename}"? The file is removed from storage.`)) return; await api(`/api/assets/${a.id}`, { method: "DELETE" }); await refresh(); }}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
