import type { GuestResponse } from "@/lib/engine/schema";
import type { RetrievedPassage } from "@/lib/research/retrieval";
import type { ConnectionTest, LlmAdapter, LlmGenerateInput, LlmGenerateResult, ProviderInfo } from "../types";

export const LOCAL_READER_ID = "local-evidence-reader";

/**
 * Offline evidence reader. Not a persona simulation and never presented as one:
 * it composes an answer purely from verbatim retrieved excerpts so the typed
 * interview loop, producer panel, persistence and exports can be exercised
 * without any credentials. It does not infer, dramatize, or speculate.
 */
export class LocalEvidenceReader implements LlmAdapter {
  readonly id = LOCAL_READER_ID;

  info(): ProviderInfo {
    return {
      id: this.id,
      category: "llm",
      name: "Offline evidence reader (no model)",
      implemented: true,
      configured: true,
      missingEnv: [],
      selection: { model: "none - verbatim excerpts" },
      capabilities: [
        { key: "persona", label: "Persona simulation", supported: false, note: "Reads excerpts aloud; does not role-play." },
        { key: "structured_output", label: "Structured producer metadata", supported: true },
        { key: "cancellation", label: "Cancel an in-flight generation", supported: true },
      ],
      notes: ["Always available. Use it to rehearse the workflow and verify citations resolve. Answers are quotes, not simulation."],
    };
  }

  async test(): Promise<ConnectionTest> {
    return { ok: true, message: "Local mode is always available.", testedAt: new Date().toISOString() };
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const started = Date.now();
    const last = input.turns[input.turns.length - 1];
    const passages = last ? extractPassages(last.content) : [];
    const parsed = compose(passages);
    return { kind: "ok", raw: parsed, parsed, model: "local-evidence-reader", usage: null, latencyMs: Date.now() - started };
  }
}

type Lite = Pick<RetrievedPassage, "passageId" | "text" | "source" | "locator">;

/** Recover the retrieved passages from the formatted turn message (ids + text). */
function extractPassages(message: string): Lite[] {
  const out: Lite[] = [];
  const re = /<passage id="([^"]+)" source="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/passage>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) {
    const [title = "", authorOrg = "", publishedAt = "", locator = "", sourceType = ""] = (m[2] ?? "").split(" | ");
    out.push({
      passageId: m[1]!,
      text: m[3] ?? "",
      locator,
      source: { title, authorOrg, publishedAt, url: "", sourceType: sourceType.replace(/ /g, "_"), isPublic: true, reviewStatus: "unreviewed" },
    });
  }
  return out;
}

function snippet(text: string, max = 260): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return `${end > 120 ? cut.slice(0, end + 1) : cut.trimEnd()}...`;
}

function compose(passages: Lite[]): GuestResponse {
  if (passages.length === 0) {
    return {
      spoken_text: "Offline evidence reader: nothing in the research collection matched that question, so there is no grounded material to read. Try rephrasing, or add sources.",
      evidence_category: "unknown",
      cited_passage_ids: [],
      explanation: "No passages were retrieved. Local mode never answers beyond retrieved excerpts.",
      conflicting_evidence: "",
      claims_needing_review: [],
      implies_private_knowledge: false,
      private_knowledge_note: "",
      names_people_in_allegation: false,
      allegation_note: "",
      question_treated_as_leading: false,
      record_establishes_answer: "no",
    };
  }
  const top = passages.slice(0, 3);
  const parts = top.map((p, i) => {
    const who = [p.source.title, p.source.publishedAt].filter(Boolean).join(", ");
    const lead = i === 0 ? "Offline evidence reader. The collection has this on record" : i === 1 ? "A second source" : "A third";
    return `${lead}${who ? ` (${who}${p.locator ? `, ${p.locator}` : ""})` : ""}: "${snippet(p.text)}"`;
  });
  return {
    spoken_text: `${parts.join(" ")} That is the extent of what was retrieved; local mode does not interpret beyond the excerpts.`,
    evidence_category: "documented",
    cited_passage_ids: top.map((p) => p.passageId),
    explanation: "Verbatim excerpts from the top-ranked retrieved passages. Local mode applies no interpretation; the producer should categorize each quoted claim (own statement vs allegation) using the source type.",
    conflicting_evidence: passages.length > 1 ? "Multiple sources retrieved; local mode does not assess whether they agree. Compare the excerpts." : "",
    claims_needing_review: top.map((p) => `Confirm the quoted excerpt from ${p.passageId} is characterised correctly (statement vs. allegation).`),
    implies_private_knowledge: false,
    private_knowledge_note: "",
    names_people_in_allegation: false,
    allegation_note: "",
    question_treated_as_leading: false,
    record_establishes_answer: "partially",
  };
}
