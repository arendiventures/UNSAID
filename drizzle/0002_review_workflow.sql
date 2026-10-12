ALTER TABLE `sources` ADD `review_status` text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `review_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `review_resolved_at` text;