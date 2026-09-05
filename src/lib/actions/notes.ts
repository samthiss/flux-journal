"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { deleteImageFileIfUnused, deleteImageFilesIfUnused } from "@/lib/imageFiles";
import { measureStoredImage } from "@/lib/imageSize";
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
    select: { id: true, title: true, parentId: true, order: true, collapsed: true },
  });
}

// Folding is a display preference, but it is stored and read on the server so
// that the first paint is already correct. Held in localStorage it could only be
// applied after hydration, which showed every branch open for a moment and then
// snapped them shut — the flash these three actions exist to remove.
//
// None of them revalidate: nothing else on the page depends on the flag, and
// revalidatePath("/notes") would refetch the whole notes payload on every click
// of a chevron. The next render reads the new value anyway, the page being
// dynamic.
export async function setNoteCollapsed(id: string, collapsed: boolean) {
  await prisma.note.update({ where: { id }, data: { collapsed } });
}

export async function setCategoryCollapsed(id: string, collapsed: boolean) {
  await prisma.noteCategory.update({ where: { id }, data: { collapsed } });
}

export async function setExampleCollapsed(id: string, collapsed: boolean) {
  await prisma.noteExample.update({ where: { id }, data: { collapsed } });
}

// The "Sans catégorie" bucket has no row of its own, so its fold lives on the
// note instead. See the comment on Note.uncategorizedCollapsed in schema.prisma.
export async function setUncategorizedCollapsed(noteId: string, collapsed: boolean) {
  await prisma.note.update({ where: { id: noteId }, data: { uncategorizedCollapsed: collapsed } });
}

export async function getNotesPageData() {
  await ensureNotesSeeded();
  const [notes, blocks, categories, examples] = await Promise.all([
    prisma.note.findMany({ orderBy: { order: "asc" } }),
    prisma.noteBlock.findMany({ orderBy: { order: "asc" } }),
    prisma.noteCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.noteExample.findMany({ orderBy: { order: "asc" } }),
  ]);
  const hiddenTagOptions = await prisma.hiddenTagOption.findMany();
  const images = examples.length
    ? await prisma.noteExampleImage.findMany({
        where: { exampleId: { in: examples.map((e) => e.id) } },
        orderBy: { order: "asc" },
      })
    : [];
  return { notes, blocks, categories, examples, images, hiddenTagOptions };
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

export async function createNoteBlock(noteId: string, type: string, categoryId: string | null = null, exampleId: string | null = null) {
  const count = await prisma.noteBlock.count({ where: exampleId ? { exampleId } : { noteId, categoryId } });
  const block = await prisma.noteBlock.create({
    data: { noteId, categoryId, exampleId, type, content: BLOCK_DEFAULT_CONTENT[type] ?? null, order: count },
  });
  revalidatePath("/notes");
  return { id: block.id, noteId: block.noteId, categoryId: block.categoryId, exampleId: block.exampleId, type: block.type, content: block.content, order: block.order, collapsed: block.collapsed };
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

/**
 * Folds a block to its label strip, or unfolds it.
 *
 * Not revalidated, like the other folds: the state is applied where it was
 * clicked, and the write is only there so the next load opens the same way.
 */
export async function setNoteBlockCollapsed(blockId: string, collapsed: boolean) {
  await prisma.noteBlock.update({ where: { id: blockId }, data: { collapsed } });
}

/**
 * Moves one block to another note, and to a category within it.
 *
 * A block sits at one of three levels — the note itself, a category, or an
 * example — and moving it always lands it at one of the first two: `categoryId`
 * null puts it in the note's own body, above the examples. Any tie to an
 * example is dropped, since the example it belonged to is not where it is
 * going. It arrives last among its new neighbours, which is the only position
 * that needs no guessing.
 *
 * The "exemples" block is refused: it is not a piece of writing but the frame
 * the categories are drawn in, and a note has at most one.
 */
export async function moveNoteBlock(blockId: string, noteId: string, categoryId: string | null) {
  const block = await prisma.noteBlock.findUnique({ where: { id: blockId } });
  if (!block || block.type === "exemples") return;

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return;
  if (categoryId) {
    const category = await prisma.noteCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.noteId !== noteId) return;
  }

  const siblings = await prisma.noteBlock.count({
    where: categoryId ? { categoryId } : { noteId, categoryId: null, exampleId: null },
  });
  await prisma.noteBlock.update({
    where: { id: blockId },
    data: { noteId, categoryId, exampleId: null, order: siblings },
  });

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

export async function deleteNote(id: string) {
  const ids = [id, ...(await collectDescendantIds(id))];
  const examples = await prisma.noteExample.findMany({ where: { noteId: { in: ids } } });
  const exampleIds = examples.map((e) => e.id);
  let urls: string[] = [];
  if (exampleIds.length) {
    const images = await prisma.noteExampleImage.findMany({ where: { exampleId: { in: exampleIds } } });
    urls = images.map((img) => img.url);
    await prisma.noteExampleImage.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteBlock.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteExample.deleteMany({ where: { noteId: { in: ids } } });
  }
  await deleteImageFilesIfUnused(urls);
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
  let urls: string[] = [];
  if (exampleIds.length) {
    const images = await prisma.noteExampleImage.findMany({ where: { exampleId: { in: exampleIds } } });
    urls = images.map((img) => img.url);
    await prisma.noteExampleImage.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteBlock.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteExample.deleteMany({ where: { categoryId: id } });
  }
  await deleteImageFilesIfUnused(urls);
  await prisma.noteBlock.deleteMany({ where: { categoryId: id } });
  await prisma.noteCategory.delete({ where: { id } });
  revalidatePath("/notes");
}

export async function clearNoteExamples(noteId: string) {
  const examples = await prisma.noteExample.findMany({ where: { noteId } });
  const exampleIds = examples.map((e) => e.id);
  let urls: string[] = [];
  if (exampleIds.length) {
    const images = await prisma.noteExampleImage.findMany({ where: { exampleId: { in: exampleIds } } });
    urls = images.map((img) => img.url);
    await prisma.noteExampleImage.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteBlock.deleteMany({ where: { exampleId: { in: exampleIds } } });
    await prisma.noteExample.deleteMany({ where: { noteId } });
  }
  await deleteImageFilesIfUnused(urls);
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

/**
 * Copies an example, with its text blocks and its images, right below the
 * original.
 *
 * The image rows are new but point at the same files. That is deliberate and
 * safe: nothing on the volume is copied, and deletion already counts how many
 * rows reference a URL before unlinking it (see src/lib/imageFiles.ts), so
 * removing either copy leaves the other one whole.
 *
 * The copy is inserted directly after its original rather than appended, since
 * a duplicate is made to be compared with what it came from.
 */
export async function duplicateExample(id: string) {
  await prisma.$transaction(async (tx) => {
    const source = await tx.noteExample.findUnique({
      where: { id },
      include: { images: { orderBy: { order: "asc" } }, blocks: { orderBy: { order: "asc" } } },
    });
    if (!source) return;

    // Everything after the original steps down one place to make room.
    await tx.noteExample.updateMany({
      where: { noteId: source.noteId, categoryId: source.categoryId, order: { gt: source.order } },
      data: { order: { increment: 1 } },
    });

    const copy = await tx.noteExample.create({
      data: {
        noteId: source.noteId,
        categoryId: source.categoryId,
        title: source.title ? `${source.title} (copie)` : "",
        caption: source.caption,
        tags: source.tags,
        confirmations: source.confirmations,
        validity: source.validity,
        invalidReasons: source.invalidReasons,
        hideText: source.hideText,
        imagesPerRow: source.imagesPerRow,
        order: source.order + 1,
      },
    });

    for (const image of source.images) {
      await tx.noteExampleImage.create({
        data: {
          exampleId: copy.id,
          url: image.url,
          caption: image.caption,
          tradeId: image.tradeId,
          order: image.order,
          width: image.width,
          height: image.height,
        },
      });
    }

    for (const block of source.blocks) {
      await tx.noteBlock.create({
        data: {
          noteId: block.noteId,
          categoryId: block.categoryId,
          exampleId: copy.id,
          type: block.type,
          content: block.content,
          order: block.order,
        },
      });
    }
  });

  revalidatePath("/notes");
}

/**
 * Removes a value from one of the example vocabularies, by removing it from
 * every example that carries it.
 *
 * There is no table of tags: a vocabulary is whatever the examples have been
 * written with, so forgetting a word means erasing it everywhere. That is the
 * point — a type or a confirmation added by mistake would otherwise sit in the
 * list for good.
 */
/** The four vocabularies, as the client names them. */
export type TagField = "tradeTypes" | "confirmations" | "invalidReasons" | "zone";

export async function deleteTagValue(field: TagField, value: string) {
  // Remembered as removed, so the ones the app ships with do not come straight
  // back from the code on the next render.
  await prisma.hiddenTagOption.upsert({
    where: { kind_value: { kind: field, value } },
    create: { kind: field, value },
    update: {},
  });

  // The zone is one word rather than a list of them, so forgetting it is a
  // clear rather than a filter.
  if (field === "zone") {
    await prisma.noteExample.updateMany({ where: { zone: value }, data: { zone: null } });
    revalidatePath("/notes");
    return;
  }

  const examples = await prisma.noteExample.findMany({
    where: { [field]: { contains: value } },
    select: { id: true, tradeTypes: true, confirmations: true, invalidReasons: true },
  });

  for (const example of examples) {
    let values: string[];
    try {
      values = JSON.parse(example[field] ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(values) || !values.includes(value)) continue;
    await prisma.noteExample.update({
      where: { id: example.id },
      data: { [field]: JSON.stringify(values.filter((v) => v !== value)) },
    });
  }

  revalidatePath("/notes");
}

/**
 * Renames a vocabulary word everywhere it is written.
 *
 * A vocabulary has no table of its own, so a word is only ever the text on the
 * examples that carry it — renaming is therefore a rewrite of those examples,
 * not an update of a row. The old spelling is then recorded as removed for the
 * same reason a deletion is: without that, the ones that ship in the code would
 * come straight back from the list on the next render, next to their new name.
 *
 * The new spelling may itself have been removed at some point, so it is
 * un-hidden; and an example already carrying both ends up with it once.
 */
export async function renameTagValue(field: TagField, from: string, to: string) {
  const next = to.trim();
  if (!next || next === from) return;

  if (field === "zone") {
    await prisma.noteExample.updateMany({ where: { zone: from }, data: { zone: next } });
  } else {
    const examples = await prisma.noteExample.findMany({
      where: { [field]: { contains: from } },
      select: { id: true, tradeTypes: true, confirmations: true, invalidReasons: true },
    });
    for (const example of examples) {
      let values: string[];
      try {
        values = JSON.parse(example[field] ?? "[]");
      } catch {
        continue;
      }
      if (!Array.isArray(values) || !values.includes(from)) continue;
      // A rename onto a word the example already carries must not double it.
      const renamed = [...new Set(values.map((v) => (v === from ? next : v)))];
      await prisma.noteExample.update({
        where: { id: example.id },
        data: { [field]: JSON.stringify(renamed) },
      });
    }
  }

  await prisma.hiddenTagOption.upsert({
    where: { kind_value: { kind: field, value: from } },
    create: { kind: field, value: from },
    update: {},
  });
  await prisma.hiddenTagOption.deleteMany({ where: { kind: field, value: next } });

  revalidatePath("/notes");
}

/**
 * Writes one vocabulary word onto several examples at once.
 *
 * The list fields gain the word if they do not already carry it — ticking a
 * type on twenty examples must not leave it twice on the three that had it —
 * while the zone and the verdict are single-valued and are simply set.
 */
export async function applyTagToExamples(
  exampleIds: string[],
  field: TagField | "validity",
  value: string
) {
  if (!exampleIds.length) return;

  if (field === "zone" || field === "validity") {
    await prisma.noteExample.updateMany({ where: { id: { in: exampleIds } }, data: { [field]: value } });
    revalidatePath("/notes");
    return;
  }

  const examples = await prisma.noteExample.findMany({
    where: { id: { in: exampleIds } },
    select: { id: true, tradeTypes: true, confirmations: true, invalidReasons: true },
  });

  for (const example of examples) {
    let values: string[] = [];
    try {
      const parsed = JSON.parse(example[field] ?? "[]");
      if (Array.isArray(parsed)) values = parsed;
    } catch {}
    if (values.includes(value)) continue;
    await prisma.noteExample.update({
      where: { id: example.id },
      data: { [field]: JSON.stringify([...values, value]) },
    });
  }

  revalidatePath("/notes");
}

/**
 * Puts a word back in a vocabulary.
 *
 * Writing a word that had been removed is how it comes back — the removal was a
 * preference, not a ban, and nothing else would let the reader undo it.
 */
export async function restoreTagValue(field: TagField, value: string) {
  await prisma.hiddenTagOption.deleteMany({ where: { kind: field, value } });
  revalidatePath("/notes");
}

export async function reorderExamples(orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.noteExample.update({ where: { id }, data: { order: i } })));
  revalidatePath("/notes");
}

export async function reorderCategories(orderedIds: string[]) {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.noteCategory.update({ where: { id }, data: { order: i } })));
  revalidatePath("/notes");
}

// Moves an example — with its images and its own text blocks — under another
// note, another category, or none. The destination is where the example lands
// last in the list, so a move never displaces what is already there.
/**
 * Moves a whole category — its examples and every block hanging off them — to
 * another note.
 *
 * Everything that belongs to the category carries a `noteId` of its own even
 * though it is addressed by `categoryId`, so all four kinds of row have to be
 * repointed together or the category would arrive somewhere while its contents
 * stayed behind, visible in neither note.
 */
export async function moveCategory(categoryId: string, noteId: string) {
  const category = await prisma.noteCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.noteId === noteId) return;
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return;

  await prisma.$transaction(async (tx) => {
    // Categories are only rendered inside an "exemples" block, as examples are.
    const exemplesBlock = await tx.noteBlock.findFirst({ where: { noteId, type: "exemples" } });
    if (!exemplesBlock) {
      const blockCount = await tx.noteBlock.count({ where: { noteId } });
      await tx.noteBlock.create({ data: { noteId, type: "exemples", content: null, order: blockCount } });
    }

    const destinationCount = await tx.noteCategory.count({ where: { noteId } });
    await tx.noteCategory.update({ where: { id: categoryId }, data: { noteId, order: destinationCount } });
    await tx.noteExample.updateMany({ where: { categoryId }, data: { noteId } });
    // The category's own text blocks, and those belonging to its examples.
    await tx.noteBlock.updateMany({ where: { categoryId }, data: { noteId } });
    const examples = await tx.noteExample.findMany({ where: { categoryId }, select: { id: true } });
    if (examples.length) {
      await tx.noteBlock.updateMany({
        where: { exampleId: { in: examples.map((e) => e.id) } },
        data: { noteId },
      });
    }

    // Close the gap left behind, so the source note keeps consecutive orders.
    const left = await tx.noteCategory.findMany({
      where: { noteId: category.noteId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (const [i, c] of left.entries()) await tx.noteCategory.update({ where: { id: c.id }, data: { order: i } });
  });

  revalidatePath("/notes");
}

export async function moveExamples(exampleIds: string[], noteId: string, categoryId: string | null) {
  const examples = await prisma.noteExample.findMany({ where: { id: { in: exampleIds } } });
  const moving = examples.filter((e) => !(e.noteId === noteId && e.categoryId === categoryId));
  if (!moving.length) return;

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return;
  // A category belongs to one note. Accepting one from another note would put
  // the example somewhere neither of the two notes displays.
  if (categoryId) {
    const category = await prisma.noteCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.noteId !== noteId) return;
  }

  await prisma.$transaction(async (tx) => {
    // Examples are only rendered inside an "exemples" block. A note that never
    // had one would swallow them silently, so it gets one here.
    const exemplesBlock = await tx.noteBlock.findFirst({ where: { noteId, type: "exemples" } });
    if (!exemplesBlock) {
      const blockCount = await tx.noteBlock.count({ where: { noteId } });
      await tx.noteBlock.create({ data: { noteId, type: "exemples", content: null, order: blockCount } });
    }

    // They land at the end, in the order they were listed, so a group keeps its
    // own sequence and never displaces what is already there.
    let next = await tx.noteExample.count({ where: { noteId, categoryId } });
    for (const example of moving) {
      await tx.noteExample.update({ where: { id: example.id }, data: { noteId, categoryId, order: next++ } });
      // An example's own blocks travel with it; they are addressed by exampleId
      // but still carry the noteId they were created under.
      await tx.noteBlock.updateMany({ where: { exampleId: example.id }, data: { noteId } });
    }

    // Close the gaps left behind, so every source list keeps consecutive
    // orders — a group can come from more than one of them.
    const sources = new Map(moving.map((e) => [`${e.noteId}|${e.categoryId ?? ""}`, e]));
    for (const source of sources.values()) {
      const left = await tx.noteExample.findMany({
        where: { noteId: source.noteId, categoryId: source.categoryId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      for (const [i, e] of left.entries()) await tx.noteExample.update({ where: { id: e.id }, data: { order: i } });
    }
  });

  revalidatePath("/notes");
}

export async function updateExample(
  id: string,
  data: {
    title?: string;
    caption?: string;
    tags?: string[];
    hideText?: boolean;
    imagesPerRow?: number;
    confirmations?: string[];
    // null clears the choice: an example with no verdict yet.
    validity?: "valid" | "invalid" | "risk" | null;
    invalidReasons?: string[];
    zone?: string | null;
    tradeTypes?: string[];
  }
) {
  const payload: Record<string, string | boolean | number | null> = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.caption !== undefined) payload.caption = data.caption;
  if (data.tags !== undefined) payload.tags = JSON.stringify(data.tags);
  if (data.hideText !== undefined) payload.hideText = data.hideText;
  if (data.imagesPerRow !== undefined) payload.imagesPerRow = data.imagesPerRow;
  if (data.confirmations !== undefined) payload.confirmations = JSON.stringify(data.confirmations);
  if (data.validity !== undefined) payload.validity = data.validity;
  if (data.invalidReasons !== undefined) payload.invalidReasons = JSON.stringify(data.invalidReasons);
  if (data.zone !== undefined) payload.zone = data.zone;
  if (data.tradeTypes !== undefined) payload.tradeTypes = JSON.stringify(data.tradeTypes);
  await prisma.noteExample.update({ where: { id }, data: payload });
  revalidatePath("/notes");
}

export async function deleteExample(id: string) {
  const images = await prisma.noteExampleImage.findMany({ where: { exampleId: id } });
  await prisma.noteExampleImage.deleteMany({ where: { exampleId: id } });
  await prisma.noteBlock.deleteMany({ where: { exampleId: id } });
  await prisma.noteExample.delete({ where: { id } });
  await deleteImageFilesIfUnused(images.map((img) => img.url));
  revalidatePath("/notes");
}

export async function updateExampleImageCaption(imageId: string, caption: string) {
  await prisma.noteExampleImage.update({ where: { id: imageId }, data: { caption } });
  revalidatePath("/notes");
}

export async function removeExampleImage(imageId: string) {
  const img = await prisma.noteExampleImage.findUnique({ where: { id: imageId } });
  if (!img) return;
  await prisma.noteExampleImage.delete({ where: { id: imageId } });
  await deleteImageFileIfUnused(img.url);
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
    // Read off the volume rather than carried over from the trade, which never
    // stored them either. A base44 chart answers null and keeps the old
    // unreserved tile.
    const size = await measureStoredImage(url);
    await prisma.noteExampleImage.create({
      data: { exampleId, url, tradeId, order: count, width: size?.width ?? null, height: size?.height ?? null },
    });
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
