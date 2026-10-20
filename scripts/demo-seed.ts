/**
 * Demo data: a clearly labeled SYNTHETIC guest ("Mara Quill", a fictional lighthouse keeper)
 * with two fictional sources, so the interview loop can be demonstrated without any API keys.
 * Nothing here concerns a real person. Safe to run repeatedly.
 */
import { openDatabase } from "../src/lib/db/client";
import { createGuest, getGuest, slugify } from "../src/lib/services/guests";
import { ingestManualRecord } from "../src/lib/research/ingest";
import { FIXTURE_GUEST, FIXTURE_SOURCE_A, FIXTURE_SOURCE_B } from "../tests/fixtures/synthetic";

const { db, sqlite } = openDatabase();
let guest = getGuest(db, slugify(FIXTURE_GUEST.displayName));
if (!guest) {
  guest = createGuest(
    db,
    {
      displayName: FIXTURE_GUEST.displayName,
      simulationLabel: "AI SIMULATION",
      status: "rehearsal_ready",
      bioSummary: "SYNTHETIC DEMO GUEST. A fictional lighthouse keeper on the fictional island of Tessaly, used only to demonstrate the workflow. Not a real person.",
      bioSources: [],
      researchStatus: "reviewed",
      knowledgeCutoff: "1932 (fictional)",
      perspective: "retrospective",
      perspectiveNotes: "Fictional demo persona. Delete this guest before production use.",
      speakingStyle: "Plain, clipped, maritime vocabulary; answers with the logbook in hand (fictional).",
      personalityInterpretations: "Interpretation for demo purposes only: stubborn about duty, impatient with rumour.",
      answerLength: "medium",
      voiceConfig: { provider: "none", kind: "stock", consentStatus: "not_applicable" },
      avatarConfig: { mode: "static_image", provider: "none" },
      assetApproval: { status: "approved", notes: "Synthetic demo - no real likeness involved." },
    },
    "Synthetic demo guest created by demo-seed",
  );
  console.log(`+ ${guest.displayName} -> ${guest.id}`);
} else console.log(`= ${guest.displayName} already exists (${guest.id})`);

const existing = sqlite.prepare("select count(*) as n from sources where guest_id = ?").get(guest.id) as { n: number };
if (existing.n === 0) {
  for (const src of [FIXTURE_SOURCE_A, FIXTURE_SOURCE_B]) {
    const out = ingestManualRecord(db, guest.id, { ...src, provenanceNotes: "SYNTHETIC fixture text written for demos and tests.", summary: "Fictional demo source." });
    console.log(`+ source "${src.title}" -> ${out.source.id} (${out.passageCount} passage${out.passageCount === 1 ? "" : "s"})`);
  }
} else console.log(`= ${existing.n} demo source(s) already present`);
console.log("\nDemo ready. Open http://127.0.0.1:3000/studio?guest=" + guest.slug + " and ask: \"Did you put out the lamp during the gale?\"");
sqlite.close();
