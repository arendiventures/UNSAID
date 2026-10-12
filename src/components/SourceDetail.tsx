"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_REVIEW_STATUSES } from "@/lib/db/schema";
import { api } from "@/lib/client";
import type { Passage, Source } from "@/lib/db/schema";
import { Badge, Card, fmtDate } from "./ui";

function highlightTerms(q: string): RegExp | null {
  const terms = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);
  if (!terms.length) return null;
  return new RegExp(`(${[...new Set(terms)].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
}

/** Renders text as plain nodes (never HTML), optionally wrapping matched terms in <mark>. */
function Highlighted({ text, re }: { text: string; re: RegExp | null }) {
  if (!re) return <>{text}</>;
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export function SourceDetail({ source, passages, guestName, highlight, focusPassage }: { source: Source; passages: Passage[]; guestName: string; highlight: string; focusPassage: string }) {
  const re = useMemo(() => highlightTerms(highlight), [highlight]);
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusPassage]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="text-xs text-ivory-mute"><Link href={`/research?guest=${source.guestId}`} className="hover:text-ivory">← Research</Link> · {guestName}</div>
      <header>
        <div className="eyebrow">Source · {source.sourceType.replace(/_/g, " ")}</div>
        <h1 className="display text-3xl font-semibold">{source.title}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={source.ingestStatus === "ingested" ? "ok" : source.ingestStatus === "ocr_required" ? "warn" : "danger"}>{source.ingestStatus.replace(/_/g, " ")}</Badge>
          <Badge tone={source.reviewStatus === "reviewed" ? "ok" : source.reviewStatus === "disputed" ? "warn" : source.reviewStatus === "excluded" ? "danger" : "default"}>review: {source.reviewStatus}</Badge>
          <Badge tone={source.isPublic ? "default" : "warn"}>{source.isPublic ? "public" : "non-public"}</Badge>
          <Badge>{passages.length} passages</Badge>
          <Badge>{source.charCount.toLocaleString()} chars</Badge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card eyebrow="Passages" title="Searchable passages" actions={source.fileRef && <a className="btn btn-sm" href={`/api/sources/${source.id}/file`} target="_blank" rel="noopener">Open original file</a>}>
          {source.ingestStatus === "ocr_required" && <p className="mb-3 text-sm text-warn">OCR required: {source.ingestError}. This file has no text layer, so no passages exist. Run OCR externally and re-upload the text.</p>}
          {source.ingestStatus === "failed" && <p className="mb-3 text-sm text-danger">Ingestion failed: {source.ingestError}</p>}
          <div className="space-y-3">
            {passages.map((p) => (
              <div key={p.id} ref={p.id === focusPassage ? focusRef : undefined} className={`rounded-lg border p-3 ${p.id === focusPassage ? "border-amber bg-amber/5" : "border-line bg-bg-elev"}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-amber-bright">{p.id}</span>
                  <span className="text-ivory-mute">{p.locator || `#${p.seq}`} · chars {p.charStart}-{p.charEnd}{p.duplicateOf ? ` · duplicate of ${p.duplicateOf}` : ""}</span>
                </div>
                <p className="prose-source mt-2 text-sm text-ivory-dim"><Highlighted text={p.text} re={re} /></p>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <ReviewCard source={source} />
          <Card eyebrow="Record" title="Metadata">
            <dl className="space-y-2 text-sm">
              <Row k="Author / org" v={source.authorOrg} />
              <Row k="Published" v={source.publishedAt} />
              <Row k="URL" v={source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-amber-bright hover:underline">{source.url}</a> : ""} />
              <Row k="File" v={source.originalFilename ?? ""} />
              <Row k="Accessed" v={fmtDate(source.accessedAt)} />
              <Row k="Locator" v={source.locator} />
              <Row k="Content hash" v={<span className="font-mono text-xs">{source.contentHash?.slice(0, 16)}</span>} />
            </dl>
          </Card>
          <Card eyebrow="Notes" title="Provenance and permissions">
            <dl className="space-y-3 text-sm">
              <Row k="Summary" v={source.summary} />
              <Row k="Provenance" v={source.provenanceNotes} />
              <Row k="Permissions" v={source.permissionNotes} />
            </dl>
          </Card>
          {source.originalExcerpt && source.fileRef && (
            <Card eyebrow="Preview" title="Original excerpt (first 2000 chars)">
              <p className="prose-source max-h-64 overflow-auto text-xs text-ivory-mute">{source.originalExcerpt}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{k}</dt>
      <dd className="mt-0.5 text-ivory-dim">{v || <span className="text-ivory-mute">—</span>}</dd>
    </div>
  );
}

function ReviewCard({ source }: { source: Source }) {
  const router = useRouter();
  const [status, setStatus] = useState(source.reviewStatus);
  const [notes, setNotes] = useState(source.reviewNotes);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const dirty = status !== source.reviewStatus || notes !== source.reviewNotes;
  return (
    <Card eyebrow="Producer review" title="Source review">
      <div className="space-y-3 text-sm">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Source["reviewStatus"])}>
          {SOURCE_REVIEW_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <p className="text-xs text-ivory-mute">
          {status === "reviewed" && "Provenance and content checked. Passages are tagged reviewed in the evidence block."}
          {status === "disputed" && "Contested material. Passages are still retrieved but tagged disputed; answers relying on them are flagged for the producer."}
          {status === "excluded" && "Removed from retrieval and from new episode snapshots. Existing citations keep their stored excerpts."}
          {status === "unreviewed" && "Nobody has checked this source yet."}
        </p>
        <textarea className="input min-h-20 text-xs" placeholder="Review notes (what was checked, concerns, who reviewed)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={async () => { setBusy(true); try { await api(`/api/sources/${source.id}`, { method: "PATCH", json: { reviewStatus: status, reviewNotes: notes } }); setSaved(`Saved ${new Date().toLocaleTimeString()}`); router.refresh(); } finally { setBusy(false); } }}>Save review</button>
          {source.reviewedAt && <span className="text-xs text-ivory-mute">last reviewed {fmtDate(source.reviewedAt)}</span>}
          {saved && <span className="text-xs text-ok">{saved}</span>}
        </div>
      </div>
    </Card>
  );
}
