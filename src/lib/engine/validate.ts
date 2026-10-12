import { GuestResponseSchema, type GuestResponse } from "./schema";
import type { RetrievedPassage } from "@/lib/research/retrieval";
import type { TurnState } from "@/lib/db/schema";

export type ValidationFlag = {
  code:
    | "malformed_output"
    | "invalid_citation"
    | "documented_without_citation"
    | "private_knowledge"
    | "allegation_names_people"
    | "allegation_without_attribution"
    | "empty_spoken_text"
    | "overlong"
    | "ids_in_spoken_text"
    | "refused"
    | "provider_error";
  severity: "block" | "warn";
  detail: string;
};

export type ProducerRecord = {
  spokenText: string;
  evidenceCategory: GuestResponse["evidence_category"] | "unknown";
  explanation: string;
  conflictingEvidence: string;
  claimsNeedingReview: string[];
  impliesPrivateKnowledge: boolean;
  privateKnowledgeNote: string;
  namesPeopleInAllegation: boolean;
  allegationNote: string;
  questionTreatedAsLeading: boolean;
  recordEstablishesAnswer: GuestResponse["record_establishes_answer"] | "no";
  citations: { passageId: string; excerpt: string; locator: string; sourceId: string; sourceTitle: string; sourceType: string }[];
  invalidCitations: string[];
  retrievedPassageIds: string[];
  flags: ValidationFlag[];
  validation: { ok: boolean; state: Extract<TurnState, "ready" | "needs_review">; validatedAt: string };
};

const ID_PATTERN = /\[?\bpsg_[a-z0-9]+_\d{4}\b\]?/g;

export function countSentences(text: string): number {
  return (text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []).length || (text.trim() ? 1 : 0);
}

/**
 * Validate a raw model output against the passages that were actually retrieved for this turn.
 * Never trusts the model's citations: every id must resolve to retrieved material.
 */
export function validateResponse(raw: unknown, retrieved: RetrievedPassage[], opts: { maxSentences?: number } = {}): ProducerRecord {
  const flags: ValidationFlag[] = [];
  const retrievedIds = new Set<string>();
  const byId = new Map<string, RetrievedPassage>();
  for (const p of retrieved) {
    retrievedIds.add(p.passageId);
    byId.set(p.passageId, p);
    for (const d of p.duplicateIds) {
      retrievedIds.add(d);
      byId.set(d, p);
    }
  }

  const parsed = GuestResponseSchema.safeParse(raw);
  if (!parsed.success) {
    flags.push({ code: "malformed_output", severity: "block", detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    return finish(
      {
        spoken_text: typeof (raw as { spoken_text?: unknown })?.spoken_text === "string" ? ((raw as { spoken_text: string }).spoken_text) : "",
        evidence_category: "unknown",
        cited_passage_ids: [],
        explanation: "",
        conflicting_evidence: "",
        claims_needing_review: [],
        implies_private_knowledge: false,
        private_knowledge_note: "",
        names_people_in_allegation: false,
        allegation_note: "",
        question_treated_as_leading: false,
        record_establishes_answer: "no",
      },
      [],
      [],
      retrieved,
      flags,
    );
  }

  const r = parsed.data;
  let spoken = r.spoken_text.trim();
  if (ID_PATTERN.test(spoken)) {
    flags.push({ code: "ids_in_spoken_text", severity: "warn", detail: "Passage ids were removed from the spoken text." });
    spoken = spoken.replace(ID_PATTERN, "").replace(/\s{2,}/g, " ").trim();
  }
  if (!spoken) flags.push({ code: "empty_spoken_text", severity: "block", detail: "The model returned no spoken text." });

  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of r.cited_passage_ids) {
    if (retrievedIds.has(id)) {
      const canonical = byId.get(id)!.passageId;
      if (!valid.includes(canonical)) valid.push(canonical);
    } else invalid.push(id);
  }
  if (invalid.length > 0) flags.push({ code: "invalid_citation", severity: "block", detail: `Cited ids not in retrieved material: ${invalid.join(", ")}` });
  if (r.evidence_category === "documented" && valid.length === 0) {
    flags.push({ code: "documented_without_citation", severity: "block", detail: "Marked as documented but cites no retrieved passage." });
  }
  if (r.implies_private_knowledge) flags.push({ code: "private_knowledge", severity: "block", detail: r.private_knowledge_note || "Model reports the answer implies undocumented private knowledge." });
  if (r.names_people_in_allegation) {
    if (r.evidence_category === "attributed_allegation" && valid.length > 0) {
      flags.push({ code: "allegation_names_people", severity: "warn", detail: r.allegation_note || "Answer references an allegation against an identifiable person; attribution cited." });
    } else {
      flags.push({ code: "allegation_without_attribution", severity: "block", detail: r.allegation_note || "Answer implicates an identifiable person without cited attribution." });
    }
  }
  const maxSentences = opts.maxSentences ?? 8;
  if (countSentences(spoken) > maxSentences) flags.push({ code: "overlong", severity: "warn", detail: `More than ${maxSentences} sentences.` });

  return finish({ ...r, spoken_text: spoken }, valid, invalid, retrieved, flags);
}

function finish(r: GuestResponse, valid: string[], invalid: string[], retrieved: RetrievedPassage[], flags: ValidationFlag[]): ProducerRecord {
  const byId = new Map(retrieved.map((p) => [p.passageId, p]));
  const blocked = flags.some((f) => f.severity === "block");
  return {
    spokenText: r.spoken_text,
    evidenceCategory: r.evidence_category,
    explanation: r.explanation,
    conflictingEvidence: r.conflicting_evidence,
    claimsNeedingReview: r.claims_needing_review,
    impliesPrivateKnowledge: r.implies_private_knowledge,
    privateKnowledgeNote: r.private_knowledge_note,
    namesPeopleInAllegation: r.names_people_in_allegation,
    allegationNote: r.allegation_note,
    questionTreatedAsLeading: r.question_treated_as_leading,
    recordEstablishesAnswer: r.record_establishes_answer,
    citations: valid.map((id) => {
      const p = byId.get(id)!;
      return { passageId: id, excerpt: p.text, locator: p.locator, sourceId: p.sourceId, sourceTitle: p.source.title, sourceType: p.source.sourceType };
    }),
    invalidCitations: invalid,
    retrievedPassageIds: retrieved.map((p) => p.passageId),
    flags,
    validation: { ok: !blocked, state: blocked ? "needs_review" : "ready", validatedAt: new Date().toISOString() },
  };
}

/** Build a producer record for a turn that never produced output (provider failure, refusal, cancel). */
export function failedRecord(code: "refused" | "provider_error", detail: string, retrieved: RetrievedPassage[]): ProducerRecord {
  return {
    spokenText: "",
    evidenceCategory: "unknown",
    explanation: "",
    conflictingEvidence: "",
    claimsNeedingReview: [],
    impliesPrivateKnowledge: false,
    privateKnowledgeNote: "",
    namesPeopleInAllegation: false,
    allegationNote: "",
    questionTreatedAsLeading: false,
    recordEstablishesAnswer: "no",
    citations: [],
    invalidCitations: [],
    retrievedPassageIds: retrieved.map((p) => p.passageId),
    flags: [{ code, severity: "block", detail }],
    validation: { ok: false, state: "needs_review", validatedAt: new Date().toISOString() },
  };
}
