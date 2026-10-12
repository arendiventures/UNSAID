import { defineConfig } from "drizzle-kit";

// SQLite for local development. Migration path to a hosted database:
// switch `dialect` to "postgresql", point `dbCredentials` at the hosted URL,
// swap src/lib/db/client.ts to the matching drizzle-orm driver, and regenerate
// migrations. The schema uses only portable column types (text/integer/JSON-as-text).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.UNSAID_DB_PATH ?? "./storage/db/unsaid.sqlite",
  },
  strict: true,
  verbose: false,
});
