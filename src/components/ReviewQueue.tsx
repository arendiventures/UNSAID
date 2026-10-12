"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Source, Turn } from "@/lib/db/schema";
import { SOURCE_REVIEW_STATUSES } from "@/lib/db/schema";
import type { ProducerRecord } from "@/lib/engine/validate";
import { api } from "@/lib/client";
import { Badge, Card, Empty, fmtDate } from "./ui";
import { TurnStateBadge } from "./InterviewStudio";

type Held = { turn: Turn; episodeTitle: string; guestName: string; episodeStatus: string };
type Pending = { source: Source; guestName: string };

export const REVIEW_TONE = { unreviewed: "default", reviewed: "ok", disputed: "warn", excluded: "danger" } as const;

/**
 * Producer review queue. Held turns are answers the validator blocked or the host flagged;
 * resolving records who looked at it and why. Sources move through unreviewed → reviewed |
 * disputed | excluded; excluded sources leave retrieval immediately.
 */
export function ReviewQueue({ heldTurns, pendingSources }: { heldTurns: Held[]; pendingSources: Pending[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function resolve(t: Turn) {
    const note = window.prompt("Resolution note (what was checked, outcome)", t.reviewNote || "");
    if (note === null) return;
    setBusy(t.id);
    try {
      await api(`/api/turns/${t.id}`, { method: "PATCH", json: { reviewResolved: true, reviewNote: note } });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function setSourceStatus(s: Source, status: Source["reviewStatus"]) {
    const notes = status === "disputed" || status === "excluded" ? window.prompt(`Why is this source ${status}?`, s.reviewNotes || "") : s.reviewNotes;
    if (notes === null) return;
    setBusy(s.id);
    try {
      await api(`/api/sources/${s.id}`, { method: "PATCH", json: { reviewStatus: status, reviewNotes: notes } });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="eyebrow">Review</div>
        <h1 className="display text-4xl font-semibold">Producer review queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-ivory-dim">Answers the validator held or the host flagged, and sources nobody has checked yet. Nothing here reaches the capture view until it is resolved.</p>
      </header>

      <Card eyebrow="Answers" title={`${heldTurns.length} turn${heldTurns.length === 1 ? "" : "s"} awaiting review`}>
        {heldTurns.length === 0 ? (
          <Empty title="Nothing held">Blocked, failed or host-flagged answers appear here.</Empty>
        ) : (
          <ul className="space-y-3">
            {heldTurns.map(({ turn: t, episodeTitle, guestName }) => {
              const p = t.producer as unknown as ProducerRecord | null;
              const blocking = p?.flags.filter((f) => f.severity === "block") ?? [];
              return (
                <li key={t.id} className="rounded-lg border border-line bg-bg-elev p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ivory-mute">
                    <span><Link href={`/episodes/${t.episodeId}`} className="text-ivory hover:text-amber-bright">{episodeTitle}</Link> · {guestName} · turn #{t.seq} · {fmtDate(t.createdAt)}</span>
                    <div className="flex items-center gap-1.5"><TurnStateBadge state={t.state} />{t.reviewFlag && <Badge tone="warn">host flagged</Badge>}</div>
                  </div>
                  <p className="mt-1 text-sm text-ivory">{t.questionText}</p>
                  <p className="mt-1 border-l-2 border-amber/50 pl-3 text-sm text-ivory-dim">{t.spokenText || <span className="italic text-ivory-mute">{t.error ?? "no spoken text"}</span>}</p>
                  {blocking.length > 0 && (
                    <ul className="mt-2 space-y-1">{blocking.map((f, i) => <li key={i} className="rounded border border-danger/40 bg-danger/5 px-2 py-1 text-xs text-danger"><span className="font-mono">{f.code}</span> — {f.detail}</li>)}</ul>
                  )}
                  {t.reviewNote && <p className="mt-1 text-xs text-warn">Note: {t.reviewNote}</p>}
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-sm btn-primary" disabled={busy === t.id} onClick={() => resolve(t)}>Mark resolved</button>
                    <Link href={`/episodes/${t.episodeId}`} className="btn btn-sm">Open evidence panel</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card eyebrow="Sources" title={`${pendingSources.length} source${pendingSources.length === 1 ? "" : "s"} unreviewed or disputed`}>
        {pendingSources.length === 0 ? (
          <Empty title="All sources reviewed" />
        ) : (
          <ul className="space-y-2">
            {pendingSources.map(({ source: s, guestName }) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bg-elev p-3">
                <div className="min-w-0">
                  <Link href={`/research/${s.id}`} className="display text-base text-ivory hover:text-amber-bright">{s.title}</Link>
                  <div className="text-xs text-ivory-mute">{guestName} · {[s.authorOrg, s.publishedAt, s.sourceType.replace(/_/g, " ")].filter(Boolean).join(" · ")} · {s.passageCount} passages</div>
                  {s.reviewNotes && <div className="text-xs text-warn">{s.reviewNotes}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={REVIEW_TONE[s.reviewStatus]}>{s.reviewStatus}</Badge>
                  {SOURCE_REVIEW_STATUSES.filter((st) => st !== s.reviewStatus && st !== "unreviewed").map((st) => (
                    <button key={st} className={`btn btn-sm ${st === "excluded" ? "btn-danger" : ""}`} disabled={busy === s.id} onClick={() => setSourceStatus(s, st)}>{st === "reviewed" ? "Mark reviewed" : st === "disputed" ? "Dispute" : "Exclude"}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
