"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/uploadDir";
import { NOTES_SEED } from "@/lib/notesSeed";

async function seedNotesTree(nodes: typeof NOTES_SEED, parentId: string | null) {
  let order = 0;
  for (const node of nodes) {
    const note = await prisma.note.create({
      data: {
        parentId,
        title: node.title,
        order: order++,
        objectif: node.objectif ?? null,
        theorie: node.theorie ? JSON.stringify(node.theorie) : null,
        regles: node.regles ? JSON.stringify(node.regles) : null,
        reglesLabel: node.reglesLabel ?? null,
        retenir: node.retenir ? JSON.stringify(node.retenir) : null,
      },
    });
    if (node.exemples && node.exemples.length) {
      const category = await prisma.noteCategory.create({ data: { noteId: note.id, name: "Exemples", order: 0 } });
      let exOrder = 0;
      for (const ex of node.exemples) {
        await prisma.noteExample.create({
          data: {
            noteId: note.id,
            categoryId: category.id,
            title: ex.title,
            caption: ex.caption,
            tags: JSON.stringify([ex.tag]),
            order: exOrder++,
          },
        });
      }
    }
    if (node.children) await seedNotesTree(node.children, note.id);
  }
}

async function ensureNotesSeeded() {
  const count = await prisma.note.count();
  if (count === 0) await seedNotesTree(NOTES_SEED, null);
}

export async function getNoteTree() {
  await ensureNotesSeeded();
  return prisma.note.findMany({
    orderBy: { order: "asc" },
    select: { id: true, title: true, parentId: true, order: true },
  });
}

export async function getNotesPageData() {
  await ensureNotesSeeded();
  const [notes, categories, examples] = await Promise.all([
    prisma.note.findMany({ orderBy: { order: "asc" } }),
    prisma.noteCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.noteExample.findMany({ orderBy: { order: "desc" } }),
  ]);
  const images = examples.length
    ? await prisma.noteExampleImage.findMany({
        where: { exampleId: { in: examples.map((e) => e.id) } },
        orderBy: { order: "asc" },
      })
    : [];
  return { notes, categories, examples, images };
}

export async function createNote(parentId: string | null) {
  const siblingCount = await prisma.note.count({ where: { parentId } });
  await prisma.note.create({ data: { parentId, title: "Nouvelle note", order: siblingCount } });
  revalidatePath("/notes");
}

export async function renameNote(id: string, title: string) {
  await prisma.note.update({ where: { id }, data: { title: title.trim() || "Sans titre" } });
  revalidatePath("/notes");
}

export async function updateNoteContent(
  id: string,
  data: {
    objectif?: string | null;
    theorie?: string[] | null;
    regles?: string[] | null;
    retenir?: string[] | null;
    blockOrder?: string[] | null;
  }
) {
  const payload: Record<string, string | null> = {};
  if ("objectif" in data) payload.objectif = data.objectif ?? null;
  if ("theorie" in data) payload.theorie = data.theorie ? JSON.stringify(data.theorie) : null;
  if ("regles" in data) payload.regles = data.regles ? JSON.stringify(data.regles) : null;
  if ("retenir" in data) payload.retenir = data.retenir ? JSON.stringify(data.retenir) : null;
  if ("blockOrder" in data) payload.blockOrder = data.blockOrder ? JSON.stringify(data.blockOrder) : null;
  await prisma.note.update({ where: { id }, data: payload });
  revalidatePath("/notes");
}

// Moves dragId to become a sibling positioned immediately before targetId,
// under targetId's parent (which may differ from dragId's current parent).
// Refuses to drop a note onto one of its own descendants.
export async function reorderNote(dragId: string, targetId: string) {
  if (dragId === targetId) return;

  async function isDescendant(ancestorId: string, id: string): Promise<boolean> {
    const children = await prisma.note.findMany({ where: { parentId: ancestorId }, select: { id: true } });
    for (const c of children) {
      if (c.id === id) return true;
      if (await isDescendant(c.id, id)) return true;
    }
    return false;
  }
  if (await isDescendant(dragId, targetId)) return;

  const drag = await prisma.note.findUnique({ where: { id: dragId } });
  const target = await prisma.note.findUnique({ where: { id: targetId } });
  if (!drag || !target) return;

  const oldParentId = drag.parentId;
  const newParentId = target.parentId;

  const oldSiblings = (await prisma.note.findMany({ where: { parentId: oldParentId }, orderBy: { order: "asc" } })).filter(
    (n) => n.id !== dragId
  );

  if (oldParentId === newParentId) {
    const targetIdx = oldSiblings.findIndex((n) => n.id === targetId);
    oldSiblings.splice(targetIdx, 0, drag);
    await prisma.$transaction(oldSiblings.map((n, i) => prisma.note.update({ where: { id: n.id }, data: { order: i } })));
  } else {
    const newSiblings = await prisma.note.findMany({ where: { parentId: newParentId }, orderBy: { order: "asc" } });
    const targetIdx = newSiblings.findIndex((n) => n.id === targetId);
    newSiblings.splice(targetIdx, 0, { ...drag, parentId: newParentId });
    await prisma.$transaction([
      ...oldSiblings.map((n, i) => prisma.note.update({ where: { id: n.id }, data: { order: i } })),
      ...newSiblings.map((n, i) => prisma.note.update({ where: { id: n.id }, data: { order: i, parentId: newParentId } })),
    ]);
  }
  revalidatePath("/notes");
}

async function collectDescendantIds(id: string): Promise<string[]> {
  const children = await prisma.note.findMany({ where: { parentId: id }, select: { id: true } });
  let ids = children.map((c) => c.id);
  for (const c of children) ids = ids.concat(await collectDescendantIds(c.id));
  return ids;
}

async function saveImage(file: File): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name) || ".png";
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `/api/uploads/${filename}`;
}

async function deleteImageFile(imagePath: string | null | undefined) {
  if (!imagePath) return;
  const filename = imagePath.split("/").pop();
  if (!filename) return;
  await unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
}

export async function deleteNote(id: string) {
  const ids = [id, ...(await collectDescendantIds(id))];
  const examples = await prisma.noteExample.findMany({ where: { noteId: { in: ids } } });
  const exampleIds = examples.map((e) => e.id);
  if (exampleIds.length) {
    const images = await prisma.noteExampleImage.findMany({ where: { exampleId: { in: exampleIds } } });
    for (const img of images) if (!img.tradeId) await deleteImageFile(img.url);
    await prisma.noteExampleImage.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteExample.deleteMany({ where: { noteId: { in: ids } } });
  }
  await prisma.noteCategory.deleteMany({ where: { noteId: { in: ids } } });
  await prisma.note.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/notes");
}

export async function createCategory(noteId: string) {
  const count = await prisma.noteCategory.count({ where: { noteId } });
  await prisma.noteCategory.create({ data: { noteId, name: "Nouvelle catégorie", order: count } });
  revalidatePath("/notes");
}

export async function createCategoryNamed(noteId: string, name: string) {
  const count = await prisma.noteCategory.count({ where: { noteId } });
  const category = await prisma.noteCategory.create({ data: { noteId, name: name.trim() || "Nouvelle catégorie", order: count } });
  revalidatePath("/notes");
  return { id: category.id, name: category.name };
}

export async function renameCategory(id: string, name: string) {
  await prisma.noteCategory.update({ where: { id }, data: { name: name.trim() || "Sans titre" } });
  revalidatePath("/notes");
}

export async function deleteCategory(id: string) {
  await prisma.noteExample.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.noteCategory.delete({ where: { id } });
  revalidatePath("/notes");
}

export async function createExample(noteId: string, categoryId: string | null) {
  const count = await prisma.noteExample.count({ where: { noteId, categoryId } });
  await prisma.noteExample.create({
    data: {
      noteId,
      categoryId,
      title: "Nouvel exemple",
      caption: "Décris le contexte, l'entrée et la sortie.",
      tags: JSON.stringify([]),
      order: count,
    },
  });
  revalidatePath("/notes");
}

export async function updateExample(id: string, data: { title?: string; caption?: string; tags?: string[] }) {
  const payload: Record<string, string> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.caption !== undefined) payload.caption = data.caption;
  if (data.tags !== undefined) payload.tags = JSON.stringify(data.tags);
  await prisma.noteExample.update({ where: { id }, data: payload });
  revalidatePath("/notes");
}

export async function deleteExample(id: string) {
  const images = await prisma.noteExampleImage.findMany({ where: { exampleId: id } });
  for (const img of images) if (!img.tradeId) await deleteImageFile(img.url);
  await prisma.noteExampleImage.deleteMany({ where: { exampleId: id } });
  await prisma.noteExample.delete({ where: { id } });
  revalidatePath("/notes");
}

export async function addExampleImage(exampleId: string, formData: FormData) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return;
  const url = await saveImage(file);
  const count = await prisma.noteExampleImage.count({ where: { exampleId } });
  await prisma.noteExampleImage.create({ data: { exampleId, url, order: count } });
  revalidatePath("/notes");
}

export async function removeExampleImage(imageId: string) {
  const img = await prisma.noteExampleImage.findUnique({ where: { id: imageId } });
  if (!img) return;
  if (!img.tradeId) await deleteImageFile(img.url);
  await prisma.noteExampleImage.delete({ where: { id: imageId } });
  revalidatePath("/notes");
}

export async function searchTrades(query: string) {
  const q = query.trim();
  const trades = await prisma.trade.findMany({
    where: q ? { symbol: { contains: q } } : undefined,
    orderBy: { date: "desc" },
    take: 20,
    select: { id: true, symbol: true, date: true, setup: true, side: true, pnl: true, chartCluster: true, chartReverse: true, chartBox: true, chartTrading: true },
  });
  return trades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    date: t.date.toISOString(),
    setup: t.setup,
    side: t.side,
    pnl: t.pnl,
    imageCount: [t.chartCluster, t.chartReverse, t.chartBox, t.chartTrading].filter(Boolean).length,
  }));
}

async function importTradeImagesInto(exampleId: string, tradeId: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return;
  const urls = [trade.chartCluster, trade.chartReverse, trade.chartBox, trade.chartTrading].filter((u): u is string => !!u);
  if (!urls.length) return;
  let count = await prisma.noteExampleImage.count({ where: { exampleId } });
  for (const url of urls) {
    await prisma.noteExampleImage.create({ data: { exampleId, url, tradeId, order: count } });
    count++;
  }
}

export async function importTradeImages(exampleId: string, tradeId: string) {
  await importTradeImagesInto(exampleId, tradeId);
  revalidatePath("/notes");
}

export async function getNoteTreeWithCategories() {
  await ensureNotesSeeded();
  const [notes, categories] = await Promise.all([
    prisma.note.findMany({ orderBy: { order: "asc" }, select: { id: true, title: true, parentId: true, order: true } }),
    prisma.noteCategory.findMany({ orderBy: { order: "asc" }, select: { id: true, noteId: true, name: true } }),
  ]);
  return { notes, categories };
}

export async function addTradeExampleToNote(tradeId: string, noteId: string, categoryId: string | null, tags: string[]) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return;
  const count = await prisma.noteExample.count({ where: { noteId, categoryId } });
  const example = await prisma.noteExample.create({
    data: {
      noteId,
      categoryId,
      title: `${trade.symbol} · ${trade.setup}`,
      caption: `${trade.date.toISOString().slice(0, 10)} · ${trade.side} · ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}`,
      tags: JSON.stringify(tags),
      order: count,
    },
  });
  await importTradeImagesInto(example.id, tradeId);
  revalidatePath("/notes");
  revalidatePath("/trades");
}
