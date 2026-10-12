"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Episode, Guest, Turn } from "@/lib/db/schema";
import { api } from "@/lib/client";
import { Badge, Card, Notice, fmtDate } from "./ui";
import { ProducerPanel } from "./ProducerPanel";
import { TurnStateBadge } from "./InterviewStudio";

export function EpisodeDetail({ episode, guest, turns }: { episode: Episode; guest: Guest; turns: Turn[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Turn | null>(turns[0] ?? null);
  const flagged = turns.filter((t) => t.reviewFlag || t.state === "needs_review" || t.state === "failed").length;
  const exp = (fmt: string) => `/api/episodes/${episode.id}/export?format=${fmt}`;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="text-xs text-ivory-mute"><Link href="/episodes" className="hover:text-ivory">← Episodes</Link></div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Episode · {episode.mode} · {guest.displayName}</div>
          <h1 className="display text-4xl font-semibold">{episode.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={episode.status === "live" ? "ok" : "default"}>{episode.status}</Badge>
            <Badge tone="amber">{guest.simulationLabel}</Badge>
            <Badge>guest v{episode.guestVersion}</Badge>
            <Badge>{episode.llmProvider ?? "-"} / {episode.llmModel ?? "-"}</Badge>
            <Badge>{episode.researchSnapshot?.sourceIds?.length ?? 0} sources · {episode.researchSnapshot?.passageCount ?? 0} passages in snapshot</Badge>
            {flagged > 0 && <Badge tone="warn">{flagged} need attention</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {episode.status === "live" && <Link href={`/studio?episode=${episode.id}`} className="btn btn-primary">Resume in studio</Link>}
          <a className="btn btn-sm" href={exp("markdown")}>Transcript (.md)</a>
          <a className="btn btn-sm" href={exp("markdown") + "&producer=1"}>Transcript + evidence (.md)</a>
          <a className="btn btn-sm" href={exp("json")}>Session data (.json)</a>
          <a className="btn btn-sm" href={exp("review")}>Review notes (.md)</a>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (!confirm(`Delete episode "${episode.title}" and all ${turns.length} turns? This cannot be undone.`)) return;
              await api(`/api/episodes/${episode.id}`, { method: "DELETE" });
              router.push("/episodes");
            }}
          >
            Delete
          </button>
        </div>
      </header>
      <Notice tone="info">Audio assets: none - this session ran in text rehearsal mode. Speech synthesis and retained audio arrive with Milestone 2. Recording is done in OBS from the capture view.</Notice>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card eyebrow="Transcript" title={`${turns.length} turn${turns.length === 1 ? "" : "s"}`}>
          <dl className="mb-4 grid grid-cols-3 gap-2 text-xs text-ivory-mute">
            <div><dt className="eyebrow">Created</dt><dd>{fmtDate(episode.createdAt)}</dd></div>
            <div><dt className="eyebrow">Started</dt><dd>{fmtDate(episode.startedAt)}</dd></div>
            <div><dt className="eyebrow">Ended</dt><dd>{fmtDate(episode.endedAt)}</dd></div>
          </dl>
          {episode.hostNotes && <div className="mb-4 rounded border border-line bg-bg-elev p-3 text-sm text-ivory-dim"><div className="eyebrow mb-1">Host notes</div>{episode.hostNotes}</div>}
          <div className="space-y-3">
            {turns.map((t) => (
              <div key={t.id} className={`cursor-pointer rounded-lg border p-3 ${selected?.id === t.id ? "border-amber/60 bg-amber/5" : "border-line bg-bg-elev"}`} onClick={() => setSelected(t)}>
                <div className="flex items-center justify-between text-xs text-ivory-mute">
                  <span>#{t.seq} · {fmtDate(t.createdAt)}{t.latencyMs != null ? ` · ${t.latencyMs} ms` : ""}</span>
                  <div className="flex items-center gap-1.5"><TurnStateBadge state={t.state} />{t.reviewFlag && <Badge tone="warn">Marked</Badge>}
                    <button className="btn btn-ghost btn-sm" onClick={async (e) => { e.stopPropagation(); const note = t.reviewFlag ? undefined : (window.prompt("Review note (optional)", t.reviewNote || "") ?? undefined); await api(`/api/turns/${t.id}`, { method: "PATCH", json: { reviewFlag: !t.reviewFlag, reviewNote: note } }); router.refresh(); }}>{t.reviewFlag ? "Unmark" : "Mark"}</button>
                  </div>
                </div>
                <p className="mt-1 text-sm text-ivory">{t.questionText}</p>
                <p className="mt-1 border-l-2 border-amber/50 pl-3 text-sm text-ivory-dim">{t.spokenText ?? <span className="italic text-ivory-mute">{t.error ?? "no answer"}</span>}</p>
                {t.reviewNote && <p className="mt-1 text-xs text-warn">Note: {t.reviewNote}</p>}
              </div>
            ))}
          </div>
        </Card>
        <ProducerPanel turn={selected} />
      </div>
    </div>
  );
}
