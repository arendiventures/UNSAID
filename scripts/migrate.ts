import { openDatabase } from "../src/lib/db/client";

const { file, sqlite } = openDatabase();
const tables = sqlite
  .prepare("select name from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name")
  .all() as { name: string }[];
console.log(`Migrations applied to ${file}`);
console.log(`Tables: ${tables.map((t) => t.name).join(", ")}`);
sqlite.close();
