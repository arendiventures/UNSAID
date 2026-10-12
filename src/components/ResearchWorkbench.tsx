"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Guest, Source } from "@/lib/db/schema";
import { SOURCE_TYPES } from "@/lib/db/schema";
import { api } from "@/lib/client";
import type { RetrievalResult } from "@/lib/research/retrieval";
import type { IngestOutcome } from "@/lib/research/ingest";
import { Badge, Card, Empty, Field, Notice, fmtDate } from "./ui";

const STATUS_TONE = { ingested: "ok", ocr_required: "warn", failed: "danger", pending: "default" } as const;

export function ResearchWorkbench({ guests, initialSources, initialGuestId }: { guests: Guest[]; initialSources: Source[]; initialGuestId: string }) {
  const router = useRouter();
  const [guestId, setGuestId] = useState(initialGuestId);
  const [sources, setSources] = useState(initialSources);
  const [tab, setTab] = useState<"search" | "upload" | "manual">("search");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const mine = useMemo(() => sources.filter((s) => s.guestId === guestId), [sources, guestId]);
  const guest = guests.find((g) => g.id === guestId);

  async function refresh() {
    setSources(await api<Source[]>("/api/sources"));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Research</div>
          <h1 className="display text-4xl font-semibold">Research collection</h1>
          <p className="mt-2 max-w-2xl text-sm text-ivory-dim">Uploaded documents are split into passages with stable ids. Search is lexical (SQLite FTS5, BM25) - not semantic. Retrieved text is treated as evidence, never as instructions.</p>
        </div>
        <Field label="Guest" inline>
          <select className="input w-64" value={guestId} onChange={(e) => { setGuestId(e.target.value); router.replace(`/research?guest=${e.target.value}`); }}>
            {guests.map((g) => <option key={g.id} value={g.id}>{g.displayName}</option>)}
          </select>
        </Field>
      </header>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="flex gap-1 rounded-lg border border-line bg-bg-elev p-1">
            {(["search", "upload", "manual"] as const).map((t) => (
              <button key={t} className={`btn btn-sm flex-1 ${tab === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t)}>
                {t === "search" ? "Search passages" : t === "upload" ? "Upload document" : "Paste excerpt + link"}
              </button>
            ))}
          </div>
          {tab === "search" && <SearchPanel guestId={guestId} />}
          {tab === "upload" && guest && <UploadForm guestId={guestId} onDone={async (o) => { setNotice({ tone: o.status === "ingested" ? "ok" : o.status === "ocr_required" ? "warn" : "danger", text: o.message }); await refresh(); }} />}
          {tab === "manual" && guest && <ManualForm guestId={guestId} onDone={async (o) => { setNotice({ tone: o.status === "ingested" ? "ok" : "danger", text: o.message }); await refresh(); }} />}
        </div>

        <Card eyebrow="Source browser" title={`${mine.length} source${mine.length === 1 ? "" : "s"}`}>
          {mine.length === 0 ? (
            <Empty title="No sources yet">Upload a document or paste an excerpt with its link.</Empty>
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-auto pr-1">
              {mine.map((s) => (
                <li key={s.id} className="rounded-lg border border-line bg-bg-elev p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/research/${s.id}`} className="display text-base leading-tight text-ivory hover:text-amber-bright">{s.title}</Link>
                    <Badge tone={STATUS_TONE[s.ingestStatus]}>{s.ingestStatus.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-ivory-mute">{[s.authorOrg, s.publishedAt, s.sourceType.replace(/_/g, " ")].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-ivory-mute">
                    <span>{s.passageCount} passages · added {fmtDate(s.createdAt)}</span>
                    <button
                      className="btn btn-ghost btn-sm text-danger"
                      onClick={async () => {
                        if (!confirm(`Delete "${s.title}" and its ${s.passageCount} passages? Episodes that cited them keep their excerpts, but the passage ids will no longer resolve.`)) return;
                        await api(`/api/sources/${s.id}`, { method: "DELETE" });
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {s.ingestError && <div className="mt-1 text-xs text-warn">{s.ingestError}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SearchPanel({ guestId }: { guestId: string }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<RetrievalResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card eyebrow="Retrieval" title="Search the collection">
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { setResult(await api<RetrievalResult>(`/api/search?guestId=${encodeURIComponent(guestId)}&q=${encodeURIComponent(q)}&limit=12`)); } finally { setBusy(false); } }}>
        <input className="input" placeholder="Ask it the way the host would…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !q.trim()}>Search</button>
      </form>
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ivory-mute">
            <Badge>{result.method.replace(/_/g, " ")}</Badge>
            <span>{result.passages.length} passage(s) shown · {result.totalMatches} raw match(es)</span>
            <span className="font-mono">FTS: {result.ftsQuery || "(no searchable terms)"}</span>
          </div>
          {result.passages.length === 0 && <Empty title="No matches">Try different words. Lexical search needs overlapping vocabulary.</Empty>}
          {result.passages.map((p) => (
            <div key={p.passageId} className="rounded-lg border border-line bg-bg-elev p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/research/${p.sourceId}?passage=${p.passageId}&q=${encodeURIComponent(q)}`} className="font-mono text-xs text-amber-bright hover:underline">{p.passageId}</Link>
                <span className="text-xs text-ivory-mute">{[p.source.title, p.locator].filter(Boolean).join(" · ")} · bm25 {p.score.toFixed(2)}</span>
              </div>
              <p className="prose-source mt-2 text-sm text-ivory-dim">{p.text}</p>
              {p.duplicateIds.length > 0 && <div className="mt-1 text-xs text-ivory-mute">Identical text also in: <span className="font-mono">{p.duplicateIds.join(", ")}</span></div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MetaFields({ meta, setMeta }: { meta: Record<string, string>; setMeta: (k: string, v: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Title *"><input className="input" required value={meta.title ?? ""} onChange={(e) => setMeta("title", e.target.value)} /></Field>
      <Field label="Author or issuing organization"><input className="input" value={meta.authorOrg ?? ""} onChange={(e) => setMeta("authorOrg", e.target.value)} /></Field>
      <Field label="Publication date"><input className="input" placeholder="YYYY-MM-DD" value={meta.publishedAt ?? ""} onChange={(e) => setMeta("publishedAt", e.target.value)} /></Field>
      <Field label="URL"><input className="input" placeholder="https://…" value={meta.url ?? ""} onChange={(e) => setMeta("url", e.target.value)} /></Field>
      <Field label="Source type">
        <select className="input" value={meta.sourceType ?? "other"} onChange={(e) => setMeta("sourceType", e.target.value)}>{SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
      </Field>
      <Field label="Page / passage locator"><input className="input" placeholder="e.g. p. 14, 00:12:30" value={meta.locator ?? ""} onChange={(e) => setMeta("locator", e.target.value)} /></Field>
      <Field label="Summary"><textarea className="input min-h-16" value={meta.summary ?? ""} onChange={(e) => setMeta("summary", e.target.value)} /></Field>
      <Field label="Provenance / authenticity notes"><textarea className="input min-h-16" value={meta.provenanceNotes ?? ""} onChange={(e) => setMeta("provenanceNotes", e.target.value)} /></Field>
      <Field label="Permission notes (non-public material)"><textarea className="input min-h-16" value={meta.permissionNotes ?? ""} onChange={(e) => setMeta("permissionNotes", e.target.value)} /></Field>
      <Field label="Public material?">
        <select className="input" value={meta.isPublic ?? "true"} onChange={(e) => setMeta("isPublic", e.target.value)}><option value="true">Public</option><option value="false">Non-public (permission required)</option></select>
      </Field>
    </div>
  );
}

function useMeta() {
  const [meta, setMetaState] = useState<Record<string, string>>({ sourceType: "other", isPublic: "true" });
  return { meta, setMeta: (k: string, v: string) => setMetaState((m) => ({ ...m, [k]: v })), reset: () => setMetaState({ sourceType: "other", isPublic: "true" }) };
}

function UploadForm({ guestId, onDone }: { guestId: string; onDone: (o: IngestOutcome) => Promise<void> }) {
  const { meta, setMeta, reset } = useMeta();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card eyebrow="Ingest" title="Upload text, markdown or text-based PDF">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          setErr(null);
          const fd = new FormData();
          fd.set("file", file);
          fd.set("guestId", guestId);
          for (const [k, v] of Object.entries(meta)) if (v) fd.set(k, v);
          try {
            const out = await api<IngestOutcome>("/api/sources", { method: "POST", body: fd });
            await onDone(out);
            setFile(null);
            reset();
            (e.target as HTMLFormElement).reset();
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="File" hint="Accepted: .txt, .md, .pdf with a text layer. Scanned PDFs are stored and marked 'OCR required' (OCR is not implemented).">
          <input className="input" type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !meta.title) setMeta("title", f.name.replace(/\.[^.]+$/, "")); }} />
        </Field>
        <MetaFields meta={meta} setMeta={setMeta} />
        {err && <Notice tone="danger">{err}</Notice>}
        <button className="btn btn-primary" disabled={busy || !file || !meta.title}>{busy ? "Ingesting…" : "Upload and split into passages"}</button>
      </form>
    </Card>
  );
}

function ManualForm({ guestId, onDone }: { guestId: string; onDone: (o: IngestOutcome) => Promise<void> }) {
  const { meta, setMeta, reset } = useMeta();
  const [excerpt, setExcerpt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card eyebrow="Ingest" title="Manually entered source record">
      <p className="mb-4 text-xs text-ivory-mute">The app does not crawl URLs. Paste the relevant excerpt yourself and record where it came from.</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const out = await api<IngestOutcome>("/api/sources", { method: "POST", json: { guestId, excerpt, ...meta, isPublic: meta.isPublic !== "false" } });
            await onDone(out);
            setExcerpt("");
            reset();
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <MetaFields meta={meta} setMeta={setMeta} />
        <Field label="Original excerpt *" hint="Verbatim. It will be split into passages and indexed."><textarea className="input min-h-40 font-mono text-xs" required value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></Field>
        {err && <Notice tone="danger">{err}</Notice>}
        <button className="btn btn-primary" disabled={busy || !excerpt.trim() || !meta.title}>{busy ? "Saving…" : "Save source record"}</button>
      </form>
    </Card>
  );
}
