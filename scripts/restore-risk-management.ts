/**
 * Puts the "Risk management" section back.
 *
 * It was deleted by accident in production, and deleting a note takes its
 * sub-notes, categories, examples, blocks and image rows with it — the image
 * files too, when nothing else references them. The rows come back from
 * `risk-management-backup.json`, exported from a local copy of the journal; the
 * 48 files were re-uploaded to the volume by hand.
 *
 * Runs at boot alongside the other one-off repairs, and does nothing once the
 * note exists again — including if it was restored some other way, which is why
 * it checks for the note rather than for a marker of its own. Ids are the ones
 * the rows had, so nothing has to be rewired and a second run cannot duplicate
 * anything.
 *
 * What it cannot bring back is anything written in that section between the
 * local copy and the deletion: the copy is a snapshot, not a live backup.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Backup = {
  notes: { id: string; parentId: string | null; title: string; order: number; collapsed: number; uncategorizedCollapsed: number }[];
  categories: { id: string; noteId: string; name: string; order: number; collapsed: number }[];
  examples: Record<string, unknown>[];
  blocks: { id: string; noteId: string; categoryId: string | null; exampleId: string | null; type: string; content: string | null; order: number }[];
  images: { id: string; exampleId: string; url: string; caption: string | null; tradeId: string | null; order: number; width: number | null; height: number | null }[];
};

const bool = (v: unknown) => v === 1 || v === true;

async function main() {
  const backup: Backup = JSON.parse(
    readFileSync(join(import.meta.dirname, "risk-management-backup.json"), "utf8")
  );
  const root = backup.notes.find((n) => !backup.notes.some((p) => p.id === n.parentId))!;

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    if (await prisma.note.findUnique({ where: { id: root.id } })) return;
    if (await prisma.note.findFirst({ where: { title: root.title, parentId: null } })) return;

    // A trade that no longer exists would fail the foreign key on its image, so
    // the link is dropped rather than the picture.
    const tradeIds = new Set(
      (await prisma.trade.findMany({ select: { id: true } })).map((t) => t.id)
    );

    // Parents before children, so every parentId already exists when the row
    // that points at it is written. The file is in display order, where the
    // root sits among its own children.
    const inserted = new Set<string>();
    const ordered: Backup["notes"] = [];
    while (ordered.length < backup.notes.length) {
      const next = backup.notes.filter(
        (n) => !inserted.has(n.id) && (!n.parentId || inserted.has(n.parentId) || !backup.notes.some((p) => p.id === n.parentId))
      );
      if (!next.length) break;
      for (const n of next) {
        inserted.add(n.id);
        ordered.push(n);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const note of ordered) {
        await tx.note.create({
          data: {
            id: note.id,
            parentId: note.parentId,
            title: note.title,
            order: note.order,
            collapsed: bool(note.collapsed),
            uncategorizedCollapsed: bool(note.uncategorizedCollapsed),
          },
        });
      }
      for (const category of backup.categories) {
        await tx.noteCategory.create({
          data: { ...category, collapsed: bool(category.collapsed) },
        });
      }
      for (const example of backup.examples) {
        await tx.noteExample.create({
          data: { ...(example as object), collapsed: bool(example.collapsed), hideText: bool(example.hideText) } as never,
        });
      }
      for (const block of backup.blocks) await tx.noteBlock.create({ data: block });
      for (const image of backup.images) {
        await tx.noteExampleImage.create({
          data: { ...image, tradeId: image.tradeId && tradeIds.has(image.tradeId) ? image.tradeId : null },
        });
      }
    });

    console.log(
      `restore-risk-management: ${backup.notes.length} notes, ${backup.examples.length} exemples et ${backup.images.length} images restaurés.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // A failed restore must not keep the journal from starting.
  console.error("restore-risk-management: échec", err);
});
