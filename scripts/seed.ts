/**
 * Seeds guest profiles. Deliberately contains NO research, biography text, speaking-style
 * claims or personality notes: those must come from ingested, cited sources and the
 * producer's own review. Running twice is safe (matches on slug).
 */
import { openDatabase } from "../src/lib/db/client";
import { createGuest, getGuest, slugify } from "../src/lib/services/guests";

const PROFILES = [
  { displayName: "Ghislaine Maxwell", note: "First guest. Research collection to be built from primary sources (court records, published interviews, contemporaneous reporting)." },
  { displayName: "Tupac Shakur", note: "Future profile - draft only." },
  { displayName: "Sean “Diddy” Combs", note: "Future profile - draft only." },
  { displayName: "Hillary Clinton", note: "Future profile - draft only." },
  { displayName: "Elon Musk", note: "Future profile - draft only." },
];

const { db, sqlite } = openDatabase();
for (const p of PROFILES) {
  const existing = getGuest(db, slugify(p.displayName));
  if (existing) {
    console.log(`= ${p.displayName} already exists (${existing.id})`);
    continue;
  }
  const g = createGuest(
    db,
    {
      displayName: p.displayName,
      simulationLabel: "AI SIMULATION",
      status: "draft",
      bioSummary: "",
      bioSources: [],
      researchStatus: "not_started",
      knowledgeCutoff: "",
      perspective: "retrospective",
      perspectiveNotes: p.note,
      speakingStyle: "",
      personalityInterpretations: "",
      answerLength: "medium",
      voiceConfig: { provider: "none", kind: "stock", consentStatus: "not_applicable" },
      avatarConfig: { mode: "static_image", provider: "none" },
      assetApproval: { status: "pending" },
    },
    "Draft profile created by seed script (no research attached)",
  );
  console.log(`+ ${p.displayName} -> ${g.id}`);
}
sqlite.close();
