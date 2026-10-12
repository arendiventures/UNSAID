import { z } from "zod";
import { EVIDENCE_CATEGORIES } from "@/lib/db/schema";

/**
 * Structured guest response. The model returns this shape; it is validated before
 * anything is spoken. All fields are required so the schema works with strict
 * structured-output decoding.
 */
export const GuestResponseSchema = z.object({
  spoken_text: z.string().describe("What the simulated guest says aloud. 2-5 sentences unless the answer-length setting says otherwise. No citations or IDs in this text."),
  evidence_category: z.enum(EVIDENCE_CATEGORIES).describe(
    "documented = supported by cited passages of the guest's own public record or official documents; attributed_allegation = a claim others made, attributed as such; inference = reasoned interpretation beyond the record; dramatization = clearly performative first-person interpretation; unknown = the record does not establish an answer.",
  ),
  cited_passage_ids: z.array(z.string()).describe("Only passage IDs that appear in <retrieved_evidence>. Empty if nothing retrieved supports the answer."),
  explanation: z.string().describe("One to three sentences for the producer explaining how the cited evidence supports the spoken text, and what is interpretation."),
  conflicting_evidence: z.string().describe("Short note on any retrieved passage that contradicts or complicates the answer. Empty string if none."),
  claims_needing_review: z.array(z.string()).describe("Specific claims in spoken_text that a producer should verify before broadcast."),
  implies_private_knowledge: z.boolean().describe("True if spoken_text asserts memories, feelings, private conversations or events that no retrieved passage documents."),
  private_knowledge_note: z.string().describe("If implies_private_knowledge, say which part. Empty string otherwise."),
  names_people_in_allegation: z.boolean().describe("True if spoken_text accuses or implicates any identifiable person in wrongdoing."),
  allegation_note: z.string().describe("If names_people_in_allegation, name the attribution (which source says it). Empty string otherwise."),
  question_treated_as_leading: z.boolean().describe("True if the host question presupposed something the record does not establish and the answer pushed back."),
  record_establishes_answer: z.enum(["yes", "partially", "no"]).describe("Whether the retrieved record actually answers the question."),
});

export type GuestResponse = z.infer<typeof GuestResponseSchema>;
