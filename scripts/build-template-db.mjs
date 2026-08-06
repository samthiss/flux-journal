// Builds a fresh, pre-seeded SQLite database at electron/resources/template.db
// by replaying prisma/migrations/*/migration.sql directly with better-sqlite3
// and seeding the real checklist content. Runs at package time, not on the
// user's machine — the packaged app never needs the Prisma CLI at runtime.
import { readdirSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { CHECKLIST_SEED } from "../prisma/checklistSeed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const migrationsDir = path.join(root, "prisma", "migrations");
const outDir = path.join(root, "electron", "resources");
const outFile = path.join(outDir, "template.db");

mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) rmSync(outFile);

const db = new Database(outFile);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
  );
`);

const migrationFolders = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const insertMigrationRow = db.prepare(`
  INSERT INTO "_prisma_migrations"
    (id, checksum, finished_at, migration_name, applied_steps_count)
  VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)
`);

for (const folder of migrationFolders) {
  const sqlPath = path.join(migrationsDir, folder, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  db.exec(sql);
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");
  insertMigrationRow.run(crypto.randomUUID(), checksum, folder);
  console.log(`applied ${folder}`);
}

const insertChecklistItem = db.prepare(`
  INSERT INTO "ChecklistItem" (id, "group", label, "order")
  VALUES (?, ?, ?, ?)
`);

let order = 0;
for (const group of CHECKLIST_SEED) {
  for (const label of group.items) {
    insertChecklistItem.run(crypto.randomUUID(), group.group, label, order++);
  }
}

db.close();
console.log(`template.db written to ${outFile}`);
