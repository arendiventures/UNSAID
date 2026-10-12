import type { Episode, Guest, Turn } from "@/lib/db/schema";
import type { ProducerRecord } from "@/lib/engine/validate";

export type ExportBundle = { episode: Episode; guest: Guest; turns: Turn[] };

function fmtTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "-";
}

export function transcriptMarkdown({ episode, guest, turns }: ExportBundle, opts: { includeProducer?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`# UNSAID - ${episode.title}`);
  lines.push("");
  lines.push(`**Guest:** ${guest.displayName} (${guest.simulationLabel})  `);
  lines.push(`**Mode:** ${episode.mode} | **Status:** ${episode.status}  `);
  lines.push(`**Started:** ${fmtTime(episode.startedAt)} | **Ended:** ${fmtTime(episode.endedAt)}  `);
  lines.push(`**Guest profile version:** ${episode.guestVersion} | **Model:** ${episode.llmProvider ?? "-"} / ${episode.llmModel ?? "-"}  `);
  lines.push(`**Research snapshot:** ${episode.researchSnapshot?.sourceIds?.length ?? 0} source(s), ${episode.researchSnapshot?.passageCount ?? 0} passage(s), taken ${fmtTime(episode.researchSnapshot?.takenAt)}`);
  lines.push("");
  lines.push(`> This transcript contains generated dialogue from a clearly labeled AI simulation. It is not testimony, a confession, or a record of the real person's statements.`);
  lines.push("");
  if (episode.hostNotes) {
    lines.push("## Host notes");
    lines.push("");
    lines.push(episode.hostNotes);
    lines.push("");
  }
  lines.push("## Transcript");
  lines.push("");
  for (const t of turns) {
    lines.push(`### ${t.seq}. Host (${fmtTime(t.createdAt)})`);
    lines.push("");
    lines.push(t.questionText);
    lines.push("");
    const label = t.state === "ready" ? "Guest" : `Guest [${t.state.replace(/_/g, " ")}]`;
    lines.push(`**${label}${t.reviewFlag ? " - MARKED FOR REVIEW" : ""}**`);
    lines.push("");
    lines.push(t.spokenText ? t.spokenText : t.error ? `_(no spoken answer: ${t.error})_` : "_(no spoken answer)_");
    lines.push("");
    if (opts.includeProducer) {
      const p = t.producer as unknown as ProducerRecord | null;
      if (p) {
        lines.push(`- Evidence category: ${p.evidenceCategory}`);
        lines.push(`- Citations: ${p.citations.length ? p.citations.map((c) => `${c.passageId} (${c.sourceTitle}${c.locator ? `, ${c.locator}` : ""}${c.sourceReviewStatus === "disputed" ? ", DISPUTED SOURCE" : ""})`).join("; ") : "none"}`);
        if (p.explanation) lines.push(`- Explanation: ${p.explanation}`);
        if (p.conflictingEvidence) lines.push(`- Conflicting evidence: ${p.conflictingEvidence}`);
        if (p.claimsNeedingReview.length) lines.push(`- Claims needing review: ${p.claimsNeedingReview.join(" | ")}`);
        if (p.flags.length) lines.push(`- Flags: ${p.flags.map((f) => `${f.severity.toUpperCase()} ${f.code}: ${f.detail}`).join(" | ")}`);
      }
      if (t.reviewNote) lines.push(`- Review note: ${t.reviewNote}`);
      if (t.reviewResolvedAt) lines.push(`- Review resolved: ${fmtTime(t.reviewResolvedAt)}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function reviewNotesMarkdown(bundle: ExportBundle): string {
  const flagged = bundle.turns.filter((t) => t.reviewFlag || t.state === "needs_review" || t.state === "failed");
  const lines = [`# Review notes - ${bundle.episode.title}`, "", `${flagged.length} turn(s) need attention.`, ""];
  for (const t of flagged) {
    const p = t.producer as unknown as ProducerRecord | null;
    lines.push(`## Turn ${t.seq} - ${t.state}${t.reviewFlag ? " (marked)" : ""}${t.reviewResolvedAt ? " (resolved)" : " (open)"}`);
    lines.push("");
    lines.push(`**Q:** ${t.questionText}`);
    lines.push("");
    lines.push(`**A:** ${t.spokenText ?? "(none)"}`);
    lines.push("");
    if (t.reviewNote) lines.push(`Producer note: ${t.reviewNote}`);
    if (t.error) lines.push(`Error: ${t.error}`);
    if (p?.flags.length) for (const f of p.flags) lines.push(`- ${f.severity.toUpperCase()} ${f.code}: ${f.detail}`);
    if (p?.claimsNeedingReview.length) for (const c of p.claimsNeedingReview) lines.push(`- Verify: ${c}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function sessionJson(bundle: ExportBundle) {
  return {
    exportedAt: new Date().toISOString(),
    format: "unsaid-session/v1",
    disclaimer: "Generated dialogue from a labeled AI simulation. Not testimony or verified statements.",
    episode: bundle.episode,
    guest: { id: bundle.guest.id, displayName: bundle.guest.displayName, simulationLabel: bundle.guest.simulationLabel, version: bundle.episode.guestVersion },
    turns: bundle.turns,
  };
}
