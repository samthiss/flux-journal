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
      data: { parentId, title: node.title, order: order++ },
    });

    let blockOrder = 0;
    if (node.objectif) {
      await prisma.noteBlock.create({ data: { noteId: note.id, type: "objectif", content: node.objectif, order: blockOrder++ } });
    }
    if (node.theorie) {
      await prisma.noteBlock.create({ data: { noteId: note.id, type: "theorie", content: JSON.stringify(node.theorie), order: blockOrder++ } });
    }
    if (node.regles) {
      const items = node.regles.map((title) => ({ title, details: [] as string[] }));
      const content = JSON.stringify({ label: node.reglesLabel ?? "", items });
      await prisma.noteBlock.create({ data: { noteId: note.id, type: "regles", content, order: blockOrder++ } });
    }
    if (node.retenir) {
      await prisma.noteBlock.create({ data: { noteId: note.id, type: "retenir", content: JSON.stringify(node.retenir), order: blockOrder++ } });
    }
    if (node.exemples && node.exemples.length) {
      await prisma.noteBlock.create({ data: { noteId: note.id, type: "exemples", content: null, order: blockOrder++ } });
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
  const [notes, blocks, categories, examples] = await Promise.all([
    prisma.note.findMany({ orderBy: { order: "asc" } }),
    prisma.noteBlock.findMany({ orderBy: { order: "asc" } }),
    prisma.noteCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.noteExample.findMany({ orderBy: { order: "asc" } }),
  ]);
  const images = examples.length
    ? await prisma.noteExampleImage.findMany({
        where: { exampleId: { in: examples.map((e) => e.id) } },
        orderBy: { order: "asc" },
      })
    : [];
  return { notes, blocks, categories, examples, images };
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

const BLOCK_DEFAULT_CONTENT: Record<string, string | null> = {
  headings: JSON.stringify(["Nouveau titre"]),
  objectif: "",
  theorie: JSON.stringify(["Nouveau paragraphe."]),
  regles: JSON.stringify({ label: "", items: [{ title: "Nouvel élément", details: [] }] }),
  retenir: JSON.stringify(["Nouveau point à retenir."]),
  invalide: JSON.stringify(["Nouvel élément à ne pas faire."]),
  exemples: null,
};

export async function createNoteBlock(noteId: string, type: string, categoryId: string | null = null) {
  const count = await prisma.noteBlock.count({ where: { noteId, categoryId } });
  const block = await prisma.noteBlock.create({
    data: { noteId, categoryId, type, content: BLOCK_DEFAULT_CONTENT[type] ?? null, order: count },
  });
  revalidatePath("/notes");
  return { id: block.id, noteId: block.noteId, categoryId: block.categoryId, type: block.type, content: block.content, order: block.order };
}

export async function createExemplesBlock(noteId: string) {
  const count = await prisma.noteBlock.count({ where: { noteId } });
  const block = await prisma.noteBlock.create({ data: { noteId, type: "exemples", content: null, order: count } });
  const category = await prisma.noteCategory.create({ data: { noteId, name: "Nouvelle catégorie", order: 0 } });
  await prisma.noteExample.create({
    data: { noteId, categoryId: category.id, title: "", caption: "", tags: JSON.stringify([]), order: 0 },
  });
  revalidatePath("/notes");
  return { id: block.id, noteId: block.noteId, type: block.type, content: block.content, order: block.order };
}

export async function updateNoteBlockContent(blockId: string, content: string | null) {
  await prisma.noteBlock.update({ where: { id: blockId }, data: { content } });
  revalidatePath("/notes");
}

export async function deleteNoteBlock(blockId: string) {
  const block = await prisma.noteBlock.findUnique({ where: { id: blockId } });
  if (!block) return;
  await prisma.noteBlock.delete({ where: { id: blockId } });
  if (block.type === "exemples") await clearNoteExamples(block.noteId);
  revalidatePath("/notes");
}

export async function reorderNoteBlocks(orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.noteBlock.update({ where: { id }, data: { order: i } })));
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

// Re-hosts a pasted image URL under our own /api/uploads instead of storing the
// remote URL directly: many hosts (Notion, private CDNs, expiring signed URLs)
// block hotlinking or require a browser session, so the raw URL would render as
// broken. Fetching it once here and saving the bytes makes it as reliable as an
// uploaded file.
async function saveImageFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error(`not an image: ${contentType}`);
  const ext = "." + (contentType.split("/")[1]?.split(";")[0] || "png");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await res.arrayBuffer());
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
  await prisma.noteBlock.deleteMany({ where: { noteId: { in: ids } } });
  await prisma.note.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/notes");
}

export async function createCategoryNamed(noteId: string, name: string) {
  const category = await prisma.$transaction(async (tx) => {
    const count = await tx.noteCategory.count({ where: { noteId } });
    return tx.noteCategory.create({ data: { noteId, name: name.trim() || "Nouvelle catégorie", order: count } });
  });
  revalidatePath("/notes");
  return { id: category.id, name: category.name };
}

export async function renameCategory(id: string, name: string) {
  await prisma.noteCategory.update({ where: { id }, data: { name: name.trim() || "Sans titre" } });
  revalidatePath("/notes");
}

export async function deleteCategory(id: string) {
  const examples = await prisma.noteExample.findMany({ where: { categoryId: id } });
  const exampleIds = examples.map((e) => e.id);
  if (exampleIds.length) {
    const images = await prisma.noteExampleImage.findMany({ where: { exampleId: { in: exampleIds } } });
    for (const img of images) if (!img.tradeId) await deleteImageFile(img.url);
    await prisma.noteExampleImage.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteExample.deleteMany({ where: { categoryId: id } });
  }
  await prisma.noteBlock.deleteMany({ where: { categoryId: id } });
  await prisma.noteCategory.delete({ where: { id } });
  revalidatePath("/notes");
}

export async function clearNoteExamples(noteId: string) {
  const examples = await prisma.noteExample.findMany({ where: { noteId } });
  const exampleIds = examples.map((e) => e.id);
  if (exampleIds.length) {
    const images = await prisma.noteExampleImage.findMany({ where: { exampleId: { in: exampleIds } } });
    for (const img of images) if (!img.tradeId) await deleteImageFile(img.url);
    await prisma.noteExampleImage.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteExample.deleteMany({ where: { noteId } });
  }
  await prisma.noteBlock.deleteMany({ where: { noteId, categoryId: { not: null } } });
  await prisma.noteCategory.deleteMany({ where: { noteId } });
  revalidatePath("/notes");
}

export async function createExample(noteId: string, categoryId: string | null) {
  await prisma.$transaction(async (tx) => {
    const count = await tx.noteExample.count({ where: { noteId, categoryId } });
    return tx.noteExample.create({
      data: {
        noteId,
        categoryId,
        title: "",
        caption: "",
        tags: JSON.stringify([]),
        order: count,
      },
    });
  });
  revalidatePath("/notes");
}

export async function reorderExamples(orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.noteExample.update({ where: { id }, data: { order: i } })));
  revalidatePath("/notes");
}

export async function updateExample(id: string, data: { title?: string; caption?: string; tags?: string[]; hideText?: boolean; imagesPerRow?: number }) {
  const payload: Record<string, string | boolean | number> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.caption !== undefined) payload.caption = data.caption;
  if (data.tags !== undefined) payload.tags = JSON.stringify(data.tags);
  if (data.hideText !== undefined) payload.hideText = data.hideText;
  if (data.imagesPerRow !== undefined) payload.imagesPerRow = data.imagesPerRow;
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

export async function addExampleImageByUrl(exampleId: string, url: string): Promise<{ ok: boolean }> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false };
  let hostedUrl: string;
  try {
    hostedUrl = await saveImageFromUrl(trimmed);
  } catch {
    return { ok: false };
  }
  const count = await prisma.noteExampleImage.count({ where: { exampleId } });
  await prisma.noteExampleImage.create({ data: { exampleId, url: hostedUrl, order: count } });
  revalidatePath("/notes");
  return { ok: true };
}

export async function updateExampleImageCaption(imageId: string, caption: string) {
  await prisma.noteExampleImage.update({ where: { id: imageId }, data: { caption } });
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
