import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { dbPath, storageDir } from "@/lib/config/env";

export type Db = BetterSQLite3Database<typeof schema>;

type Handle = { sqlite: Database.Database; db: Db; file: string };

// Survive Next.js dev hot reloads without leaking connections.
const globalRef = globalThis as unknown as { __unsaidDb?: Handle };

function migrationsFolder(): string {
  return path.resolve(process.cwd(), "drizzle");
}

export function openDatabase(file: string = dbPath()): Handle {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const sub of ["research", "assets", "media", "exports"]) {
    fs.mkdirSync(path.join(storageDir(), sub), { recursive: true });
  }
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return { sqlite, db, file };
}

export function getDb(): Db {
  if (!globalRef.__unsaidDb) globalRef.__unsaidDb = openDatabase();
  return globalRef.__unsaidDb.db;
}

export function getSqlite(): Database.Database {
  if (!globalRef.__unsaidDb) globalRef.__unsaidDb = openDatabase();
  return globalRef.__unsaidDb.sqlite;
}

/** Test helper: an isolated in-memory database with all migrations applied. */
export function openMemoryDatabase(): Handle {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return { sqlite, db, file: ":memory:" };
}

export { schema };
