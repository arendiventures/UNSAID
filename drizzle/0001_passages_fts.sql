-- Full-text index over passages (SQLite FTS5, external-content table kept in sync by triggers).
-- Migration path: on PostgreSQL replace with a tsvector column + GIN index; src/lib/research/retrieval.ts is the only consumer.
CREATE VIRTUAL TABLE `passages_fts` USING fts5(`text`, `guest_id` UNINDEXED, content='passages', content_rowid='rowid', tokenize='porter unicode61');
--> statement-breakpoint
CREATE TRIGGER `passages_fts_ai` AFTER INSERT ON `passages` BEGIN
  INSERT INTO `passages_fts`(rowid, `text`, `guest_id`) VALUES (new.rowid, new.`text`, new.`guest_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `passages_fts_ad` AFTER DELETE ON `passages` BEGIN
  INSERT INTO `passages_fts`(`passages_fts`, rowid, `text`, `guest_id`) VALUES ('delete', old.rowid, old.`text`, old.`guest_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `passages_fts_au` AFTER UPDATE ON `passages` BEGIN
  INSERT INTO `passages_fts`(`passages_fts`, rowid, `text`, `guest_id`) VALUES ('delete', old.rowid, old.`text`, old.`guest_id`);
  INSERT INTO `passages_fts`(rowid, `text`, `guest_id`) VALUES (new.rowid, new.`text`, new.`guest_id`);
END;
