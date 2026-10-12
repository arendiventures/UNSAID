CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`guest_id` text,
	`episode_id` text,
	`label` text DEFAULT '' NOT NULL,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`path` text NOT NULL,
	`sha256` text NOT NULL,
	`width` integer,
	`height` integer,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assets_kind_idx` ON `assets` (`kind`);--> statement-breakpoint
CREATE INDEX `assets_guest_idx` ON `assets` (`guest_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`title` text NOT NULL,
	`mode` text DEFAULT 'text' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`guest_version` integer DEFAULT 0 NOT NULL,
	`guest_snapshot` text DEFAULT '{}' NOT NULL,
	`research_snapshot` text DEFAULT '{}' NOT NULL,
	`answer_length` text,
	`host_notes` text DEFAULT '' NOT NULL,
	`llm_provider` text,
	`llm_model` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `episodes_guest_idx` ON `episodes` (`guest_id`);--> statement-breakpoint
CREATE INDEX `episodes_status_idx` ON `episodes` (`status`);--> statement-breakpoint
CREATE TABLE `guest_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`category` text NOT NULL,
	`text` text NOT NULL,
	`source_id` text,
	`passage_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guest_entries_guest_idx` ON `guest_entries` (`guest_id`,`category`);--> statement-breakpoint
CREATE TABLE `guest_instruction_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`change_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `giv_guest_version_idx` ON `guest_instruction_versions` (`guest_id`,`version`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`simulation_label` text DEFAULT 'AI SIMULATION' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`bio_summary` text DEFAULT '' NOT NULL,
	`bio_sources` text DEFAULT '[]' NOT NULL,
	`research_status` text DEFAULT 'not_started' NOT NULL,
	`knowledge_cutoff` text DEFAULT '' NOT NULL,
	`perspective` text DEFAULT 'retrospective' NOT NULL,
	`perspective_notes` text DEFAULT '' NOT NULL,
	`speaking_style` text DEFAULT '' NOT NULL,
	`personality_interpretations` text DEFAULT '' NOT NULL,
	`answer_length` text DEFAULT 'medium' NOT NULL,
	`voice_config` text DEFAULT '{}' NOT NULL,
	`avatar_config` text DEFAULT '{}' NOT NULL,
	`asset_approval` text DEFAULT '{}' NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guests_slug_idx` ON `guests` (`slug`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text,
	`idempotency_key` text,
	`input` text DEFAULT '{}' NOT NULL,
	`result` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`timeout_ms` integer DEFAULT 120000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_idx` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE TABLE `passages` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`seq` integer NOT NULL,
	`text` text NOT NULL,
	`locator` text DEFAULT '' NOT NULL,
	`char_start` integer DEFAULT 0 NOT NULL,
	`char_end` integer DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`duplicate_of` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passages_source_seq_idx` ON `passages` (`source_id`,`seq`);--> statement-breakpoint
CREATE INDEX `passages_guest_idx` ON `passages` (`guest_id`);--> statement-breakpoint
CREATE INDEX `passages_hash_idx` ON `passages` (`guest_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `provider_checks` (
	`provider` text PRIMARY KEY NOT NULL,
	`last_test_at` text,
	`ok` integer,
	`message` text,
	`details` text,
	`last_error` text,
	`last_error_at` text
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`title` text NOT NULL,
	`author_org` text DEFAULT '' NOT NULL,
	`published_at` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`file_ref` text,
	`original_filename` text,
	`mime_type` text,
	`file_size` integer,
	`accessed_at` text NOT NULL,
	`source_type` text DEFAULT 'other' NOT NULL,
	`locator` text DEFAULT '' NOT NULL,
	`original_excerpt` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`provenance_notes` text DEFAULT '' NOT NULL,
	`permission_notes` text DEFAULT '' NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`ingest_status` text DEFAULT 'pending' NOT NULL,
	`ingest_error` text,
	`content_hash` text,
	`char_count` integer DEFAULT 0 NOT NULL,
	`passage_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_guest_idx` ON `sources` (`guest_id`);--> statement-breakpoint
CREATE INDEX `sources_hash_idx` ON `sources` (`guest_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`seq` integer NOT NULL,
	`question_text` text NOT NULL,
	`input_mode` text DEFAULT 'typed' NOT NULL,
	`transcript_meta` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`spoken_text` text,
	`response` text,
	`producer` text,
	`retrieved_passage_ids` text DEFAULT '[]' NOT NULL,
	`provider` text,
	`model` text,
	`usage` text,
	`latency_ms` integer,
	`error` text,
	`review_flag` integer DEFAULT false NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`audio_asset_id` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turns_episode_seq_idx` ON `turns` (`episode_id`,`seq`);