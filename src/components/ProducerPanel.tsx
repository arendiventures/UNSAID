"use client";

import Link from "next/link";
import type { Turn } from "@/lib/db/schema";
import type { ProducerRecord } from "@/lib/engine/validate";
import { Badge, Card } from "./ui";

const CATEGORY_TONE: Record<string, "ok" | "warn" | "info" | "amber" | "default"> = { documented: "ok", attributed_allegation: "warn", inference: "info", dramatization: "amber", unknown: "default" };

/**
 * Producer-only view. Never rendered in the capture route. Shows brief evidence-based
 * justifications and source mappings - no hidden reasoning, no invented confidence scores.
 */
export function ProducerPanel({ turn }: { turn: Turn | null }) {
  const p = (turn?.producer ?? null) as ProducerRecord | null;
  return (
    <Card eyebrow="Producer panel · not for broadcast" title={turn ? `Turn #${turn.seq}` : "Evidence"} actions={turn && <Badge tone={turn.state === "ready" ? "ok" : "warn"}>{turn.state.replace(/_/g, " ")}</Badge>}>
      {!turn && <p className="text-sm text-ivory-mute">Select a turn to see its evidence map.</p>}
      {turn && !p && <p className="text-sm text-ivory-mute">{turn.error ?? "No producer record for this turn yet."}</p>}
      {turn && p && (
        <div className="space-y-4 text-sm">
          <section>
            <div className="eyebrow mb-1">Spoken text</div>
            <p className="text-ivory">{p.spokenText || <span className="italic text-ivory-mute">(nothing was cleared to speak)</span>}</p>
          </section>

          <section className="flex flex-wrap items-center gap-1.5">
            <Badge tone={CATEGORY_TONE[p.evidenceCategory] ?? "default"}>{p.evidenceCategory.replace(/_/g, " ")}</Badge>
            <Badge tone={p.recordEstablishesAnswer === "yes" ? "ok" : p.recordEstablishesAnswer === "partially" ? "warn" : "default"}>record: {p.recordEstablishesAnswer}</Badge>
            {p.questionTreatedAsLeading && <Badge tone="info">pushed back on premise</Badge>}
            <Badge tone={p.impliesPrivateKnowledge ? "danger" : "ok"}>{p.impliesPrivateKnowledge ? "implies private knowledge" : "no private knowledge claimed"}</Badge>
            <Badge tone={p.namesPeopleInAllegation ? "danger" : "ok"}>{p.namesPeopleInAllegation ? "names people in allegation" : "no allegations against people"}</Badge>
          </section>

          {p.flags.length > 0 && (
            <section>
              <div className="eyebrow mb-1">Validation flags</div>
              <ul className="space-y-1">
                {p.flags.map((f, i) => (
                  <li key={i} className={`rounded border px-2 py-1 text-xs ${f.severity === "block" ? "border-danger/50 bg-danger/5 text-danger" : "border-warn/50 bg-warn/5 text-warn"}`}>
                    <span className="font-mono">{f.severity}:{f.code}</span> — {f.detail}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="eyebrow mb-1">Explanation</div>
            <p className="text-ivory-dim">{p.explanation || "—"}</p>
          </section>

          <section>
            <div className="eyebrow mb-1">Cited passages ({p.citations.length})</div>
            {p.citations.length === 0 && <p className="text-xs text-ivory-mute">No retrieved passage was cited.</p>}
            <ul className="space-y-2">
              {p.citations.map((c) => (
                <li key={c.passageId} className="rounded border border-line bg-bg-elev p-2">
                  <div className="flex items-center justify-between text-xs">
                    <Link href={`/research/${c.sourceId}?passage=${c.passageId}`} className="font-mono text-amber-bright hover:underline" target="_blank">{c.passageId}</Link>
                    <span className="flex items-center gap-1.5 text-ivory-mute">{c.sourceTitle}{c.locator ? ` · ${c.locator}` : ""} · {c.sourceType.replace(/_/g, " ")}{c.sourceReviewStatus === "disputed" && <Badge tone="warn">disputed source</Badge>}{c.sourceReviewStatus === "reviewed" && <Badge tone="ok">reviewed</Badge>}</span>
                  </div>
                  <p className="prose-source mt-1 max-h-32 overflow-auto text-xs text-ivory-dim">{c.excerpt}</p>
                </li>
              ))}
            </ul>
            {p.invalidCitations.length > 0 && <p className="mt-1 text-xs text-danger">Rejected (not in retrieved material): <span className="font-mono">{p.invalidCitations.join(", ")}</span></p>}
          </section>

          {p.conflictingEvidence && (
            <section>
              <div className="eyebrow mb-1">Conflicting evidence</div>
              <p className="text-warn">{p.conflictingEvidence}</p>
            </section>
          )}
          {(p.privateKnowledgeNote || p.allegationNote) && (
            <section>
              <div className="eyebrow mb-1">Notes</div>
              {p.privateKnowledgeNote && <p className="text-xs text-ivory-dim">Private knowledge: {p.privateKnowledgeNote}</p>}
              {p.allegationNote && <p className="text-xs text-ivory-dim">Allegation attribution: {p.allegationNote}</p>}
            </section>
          )}
          {p.claimsNeedingReview.length > 0 && (
            <section>
              <div className="eyebrow mb-1">Claims needing review</div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-ivory-dim">{p.claimsNeedingReview.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </section>
          )}

          <section className="border-t border-line pt-3 text-xs text-ivory-mute">
            <div>Retrieved {p.retrievedPassageIds.length} passage(s): <span className="font-mono">{p.retrievedPassageIds.join(", ") || "none"}</span></div>
            <div className="mt-1">Provider {turn.provider ?? "-"} · model {turn.model ?? "-"} · {turn.latencyMs != null ? `${turn.latencyMs} ms` : "-"}{turn.usage ? ` · tokens in ${turn.usage.inputTokens ?? "?"} / out ${turn.usage.outputTokens ?? "?"}${turn.usage.cacheReadInputTokens ? ` / cache read ${turn.usage.cacheReadInputTokens}` : ""}` : " · usage not reported by this provider"}</div>
            {turn.reviewNote && <div className="mt-1 text-warn">Review note: {turn.reviewNote}</div>}
          </section>
        </div>
      )}
    </Card>
  );
}
