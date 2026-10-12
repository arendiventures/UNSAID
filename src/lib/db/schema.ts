import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Portable schema: only text / integer / JSON-as-text columns and ISO-8601 timestamps,
 * so the same definitions can move to PostgreSQL with a dialect swap.
 */

// ---------- Shared JSON shapes ----------
export type BioSourceRef = { label: string; url?: string; sourceId?: string; passageId?: string };
export type VoiceConfig = {
  provider: "none" | "elevenlabs";
  voiceId?: string;
  label?: string;
  kind: "stock" | "custom";
  consentStatus: "not_applicable" | "pending" | "verified";
  notes?: string;
};
export type AvatarConfig = {
  mode: "static_image" | "provider_avatar";
  provider: "none" | "tavus" | "heygen";
  avatarId?: string;
  staticAssetId?: string;
  notes?: string;
};
export type AssetApproval = {
  status: "pending" | "approved" | "rejected";
  notes?: string;
  decidedAt?: string;
};
export type GuestSnapshot = Record<string, unknown>;

export const GUEST_STATUSES = ["draft", "in_research", "rehearsal_ready", "production_ready"] as const;
export const RESEARCH_STATUSES = ["not_started", "collecting", "under_review", "reviewed"] as const;
export const PERSPECTIVES = ["retrospective", "period_specific"] as const;
export const ANSWER_LENGTHS = ["short", "medium", "long"] as const;
export const ENTRY_CATEGORIES = [
  "verified_statement",
  "attributed_allegation",
  "behavioral_interpretation",
  "performance_direction",
] as const;
export const SOURCE_TYPES = [
  "court_document",
  "official_statement",
  "news_article",
  "interview_transcript",
  "book_excerpt",
  "academic",
  "social_media",
  "video_transcript",
  "personal_notes",
  "other",
] as const;
export const INGEST_STATUSES = ["pending", "ingested", "ocr_required", "failed"] as const;
export const EPISODE_MODES = ["text", "audio", "avatar"] as const;
export const EPISODE_STATUSES = ["draft", "live", "ended"] as const;
export const TURN_STATES = [
  "queued",
  "retrieving",
  "generating",
  "validating",
  "ready",
  "needs_review",
  "failed",
  "interrupted",
] as const;
export const EVIDENCE_CATEGORIES = ["documented", "attributed_allegation", "inference", "dramatization", "unknown"] as const;
export const ASSET_KINDS = [
  "brand_logo",
  "studio_backdrop",
  "guest_concept_image",
  "episode_thumbnail",
  "audio",
  "video",
  "other",
] as const;
export const JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

export type GuestStatus = (typeof GUEST_STATUSES)[number];
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];
export type Perspective = (typeof PERSPECTIVES)[number];
export type AnswerLength = (typeof ANSWER_LENGTHS)[number];
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type IngestStatus = (typeof INGEST_STATUSES)[number];
export type EpisodeMode = (typeof EPISODE_MODES)[number];
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];
export type TurnState = (typeof TURN_STATES)[number];
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];
export type AssetKind = (typeof ASSET_KINDS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

const jsonArray = () => sql`'[]'`;
const jsonObject = () => sql`'{}'`;

// ---------- Guests ----------
export const guests = sqliteTable(
  "guests",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    simulationLabel: text("simulation_label").notNull().default("AI SIMULATION"),
    status: text("status").$type<GuestStatus>().notNull().default("draft"),
    bioSummary: text("bio_summary").notNull().default(""),
    bioSources: text("bio_sources", { mode: "json" }).$type<BioSourceRef[]>().notNull().default(jsonArray()),
    researchStatus: text("research_status").$type<ResearchStatus>().notNull().default("not_started"),
    knowledgeCutoff: text("knowledge_cutoff").notNull().default(""),
    perspective: text("perspective").$type<Perspective>().notNull().default("retrospective"),
    perspectiveNotes: text("perspective_notes").notNull().default(""),
    speakingStyle: text("speaking_style").notNull().default(""),
    personalityInterpretations: text("personality_interpretations").notNull().default(""),
    answerLength: text("answer_length").$type<AnswerLength>().notNull().default("medium"),
    voiceConfig: text("voice_config", { mode: "json" }).$type<VoiceConfig>().notNull().default(jsonObject()),
    avatarConfig: text("avatar_config", { mode: "json" }).$type<AvatarConfig>().notNull().default(jsonObject()),
    assetApproval: text("asset_approval", { mode: "json" }).$type<AssetApproval>().notNull().default(jsonObject()),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("guests_slug_idx").on(t.slug)],
);

export const guestInstructionVersions = sqliteTable(
  "guest_instruction_versions",
  {
    id: text("id").primaryKey(),
    guestId: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<GuestSnapshot>().notNull(),
    changeNote: text("change_note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("giv_guest_version_idx").on(t.guestId, t.version)],
);

/** Separated evidence ledger: statements vs allegations vs interpretations vs performance directions. */
export const guestEntries = sqliteTable(
  "guest_entries",
  {
    id: text("id").primaryKey(),
    guestId: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
    category: text("category").$type<EntryCategory>().notNull(),
    text: text("text").notNull(),
    sourceId: text("source_id"),
    passageId: text("passage_id"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("guest_entries_guest_idx").on(t.guestId, t.category)],
);

// ---------- Research ----------
export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    guestId: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    authorOrg: text("author_org").notNull().default(""),
    publishedAt: text("published_at").notNull().default(""),
    url: text("url").notNull().default(""),
    fileRef: text("file_ref"),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    accessedAt: text("accessed_at").notNull(),
    sourceType: text("source_type").$type<SourceType>().notNull().default("other"),
    locator: text("locator").notNull().default(""),
    originalExcerpt: text("original_excerpt").notNull().default(""),
    summary: text("summary").notNull().default(""),
    provenanceNotes: text("provenance_notes").notNull().default(""),
    permissionNotes: text("permission_notes").notNull().default(""),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    ingestStatus: text("ingest_status").$type<IngestStatus>().notNull().default("pending"),
    ingestError: text("ingest_error"),
    contentHash: text("content_hash"),
    charCount: integer("char_count").notNull().default(0),
    passageCount: integer("passage_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("sources_guest_idx").on(t.guestId), index("sources_hash_idx").on(t.guestId, t.contentHash)],
);

export const passages = sqliteTable(
  "passages",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    guestId: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
    locator: text("locator").notNull().default(""),
    charStart: integer("char_start").notNull().default(0),
    charEnd: integer("char_end").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    duplicateOf: text("duplicate_of"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("passages_source_seq_idx").on(t.sourceId, t.seq),
    index("passages_guest_idx").on(t.guestId),
    index("passages_hash_idx").on(t.guestId, t.contentHash),
  ],
);

// ---------- Episodes ----------
export type ResearchSnapshot = { takenAt: string; sourceIds: string[]; passageCount: number };

export const episodes = sqliteTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    guestId: text("guest_id").notNull().references(() => guests.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    mode: text("mode").$type<EpisodeMode>().notNull().default("text"),
    status: text("status").$type<EpisodeStatus>().notNull().default("draft"),
    guestVersion: integer("guest_version").notNull().default(0),
    guestSnapshot: text("guest_snapshot", { mode: "json" }).$type<GuestSnapshot>().notNull().default(jsonObject()),
    researchSnapshot: text("research_snapshot", { mode: "json" })
      .$type<ResearchSnapshot>()
      .notNull()
      .default(jsonObject()),
    answerLength: text("answer_length").$type<AnswerLength>(),
    hostNotes: text("host_notes").notNull().default(""),
    llmProvider: text("llm_provider"),
    llmModel: text("llm_model"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("episodes_guest_idx").on(t.guestId), index("episodes_status_idx").on(t.status)],
);

export type TurnUsage = { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number };

export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    questionText: text("question_text").notNull(),
    inputMode: text("input_mode").$type<"typed" | "voice">().notNull().default("typed"),
    transcriptMeta: text("transcript_meta", { mode: "json" }).$type<Record<string, unknown> | null>(),
    state: text("state").$type<TurnState>().notNull().default("queued"),
    spokenText: text("spoken_text"),
    response: text("response", { mode: "json" }).$type<Record<string, unknown> | null>(),
    producer: text("producer", { mode: "json" }).$type<Record<string, unknown> | null>(),
    retrievedPassageIds: text("retrieved_passage_ids", { mode: "json" }).$type<string[]>().notNull().default(jsonArray()),
    provider: text("provider"),
    model: text("model"),
    usage: text("usage", { mode: "json" }).$type<TurnUsage | null>(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    reviewFlag: integer("review_flag", { mode: "boolean" }).notNull().default(false),
    reviewNote: text("review_note").notNull().default(""),
    audioAssetId: text("audio_asset_id"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [uniqueIndex("turns_episode_seq_idx").on(t.episodeId, t.seq)],
);

// ---------- Assets, jobs, provider checks ----------
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<AssetKind>().notNull(),
    guestId: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
    episodeId: text("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    label: text("label").notNull().default(""),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    path: text("path").notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    approvalStatus: text("approval_status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("assets_kind_idx").on(t.kind), index("assets_guest_idx").on(t.guestId)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    provider: text("provider"),
    idempotencyKey: text("idempotency_key"),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(jsonObject()),
    result: text("result", { mode: "json" }).$type<Record<string, unknown> | null>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    timeoutMs: integer("timeout_ms").notNull().default(120000),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [uniqueIndex("jobs_idempotency_idx").on(t.idempotencyKey), index("jobs_status_idx").on(t.status)],
);

export const providerChecks = sqliteTable("provider_checks", {
  provider: text("provider").primaryKey(),
  lastTestAt: text("last_test_at"),
  ok: integer("ok", { mode: "boolean" }),
  message: text("message"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown> | null>(),
  lastError: text("last_error"),
  lastErrorAt: text("last_error_at"),
});

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
export type GuestEntry = typeof guestEntries.$inferSelect;
export type GuestInstructionVersion = typeof guestInstructionVersions.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Passage = typeof passages.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Turn = typeof turns.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type ProviderCheck = typeof providerChecks.$inferSelect;
