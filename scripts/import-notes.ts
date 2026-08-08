import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const IN_FILE = process.argv[2] ?? "/tmp/notes-dump.json";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

type Dump = {
  notes: { id: string; parentId: string | null; title: string; order: number; createdAt: string }[];
  blocks: { id: string; noteId: string; categoryId: string | null; exampleId: string | null; type: string; content: string | null; order: number; createdAt: string }[];
  categories: { id: string; noteId: string; name: string; order: number }[];
  examples: { id: string; noteId: string; categoryId: string | null; title: string; caption: string | null; tags: string | null; hideText: boolean; imagesPerRow: number; order: number; createdAt: string }[];
  images: { id: string; exampleId: string; url: string; caption: string | null; tradeId: string | null; order: number }[];
};

async function main() {
  const dump: Dump = JSON.parse(readFileSync(IN_FILE, "utf8"));

  await prisma.noteExampleImage.deleteMany({});
  await prisma.noteExample.deleteMany({});
  await prisma.noteBlock.deleteMany({});
  await prisma.noteCategory.deleteMany({});
  await prisma.note.deleteMany({});

  for (const n of dump.notes) {
    await prisma.note.create({ data: { ...n, createdAt: new Date(n.createdAt) } });
  }
  for (const c of dump.categories) {
    await prisma.noteCategory.create({ data: c });
  }
  for (const ex of dump.examples) {
    await prisma.noteExample.create({ data: { ...ex, createdAt: new Date(ex.createdAt) } });
  }
  for (const b of dump.blocks) {
    await prisma.noteBlock.create({ data: { ...b, createdAt: new Date(b.createdAt) } });
  }
  for (const img of dump.images) {
    await prisma.noteExampleImage.create({ data: img });
  }

  console.log(`Imported ${dump.notes.length} notes, ${dump.blocks.length} blocks, ${dump.categories.length} categories, ${dump.examples.length} examples, ${dump.images.length} images.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
