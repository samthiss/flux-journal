import { writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const OUT_FILE = process.argv[2] ?? "/tmp/notes-dump.json";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [notes, blocks, categories, examples, images] = await Promise.all([
    prisma.note.findMany({ orderBy: { order: "asc" } }),
    prisma.noteBlock.findMany({ orderBy: { order: "asc" } }),
    prisma.noteCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.noteExample.findMany({ orderBy: { order: "asc" } }),
    prisma.noteExampleImage.findMany({ orderBy: { order: "asc" } }),
  ]);
  writeFileSync(OUT_FILE, JSON.stringify({ notes, blocks, categories, examples, images }, null, 0));
  console.log(`Exported ${notes.length} notes, ${blocks.length} blocks, ${categories.length} categories, ${examples.length} examples, ${images.length} images to ${OUT_FILE}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
