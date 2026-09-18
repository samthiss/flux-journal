"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Only the item definitions live in the database. Which items are ticked is
// per-device state held in localStorage by the checklist components, so there
// is deliberately no server-side "checked" concept here.
export async function getChecklistItems() {
  return prisma.checklistItem.findMany({ orderBy: { order: "asc" } });
}

export async function createChecklistItem(group: string, label: string, category?: string, tab?: string) {
  const trimmedGroup = group.trim();
  const trimmedLabel = label.trim();
  if (!trimmedGroup || !trimmedLabel) return;

  const last = await prisma.checklistItem.findFirst({
    orderBy: { order: "desc" },
  });

  // Returned so a choice block can be given its answers straight after, in one
  // gesture, instead of being created then converted.
  const cree = await prisma.checklistItem.create({
    data: {
      group: trimmedGroup,
      label: trimmedLabel,
      category: category?.trim() || null,
      tab: tab || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath("/checklist");
  return { id: cree.id };
}

/**
 * Renames a heading, and everything filed under it with it.
 *
 * A category exists only through its lines, like a group: there is nothing
 * else to rename.
 */
/**
 * Removes a heading and the lines filed under it.
 *
 * Like a group: a category exists only through its lines, so leaving them
 * behind without one would scatter them back into the group with no way to
 * tell which heading they came from.
 */
/**
 * Puts the lines of a section back in the order they were dragged into.
 *
 * The moved line is given its new heading first — a drop under another one is
 * how a line changes heading — and then the whole section is renumbered.
 *
 * Renumbered over the slots it already occupied, not from zero: `order` runs
 * across the whole checklist, and a section renumbered 0..n would slide in
 * front of every other line in the journal.
 */
export async function reorderChecklistItems(
  ids: string[],
  moved?: { id: string; group: string; category: string | null },
) {
  if (ids.length === 0) return;

  if (moved) {
    await prisma.checklistItem.update({
      where: { id: moved.id },
      data: { group: moved.group, category: moved.category },
    });
  }

  const concernes = await prisma.checklistItem.findMany({
    where: { id: { in: ids } },
    select: { order: true },
  });
  const places = concernes.map((item) => item.order).sort((a, b) => a - b);

  await prisma.$transaction(
    ids.map((id, i) => prisma.checklistItem.update({ where: { id }, data: { order: places[i] } })),
  );
  revalidatePath("/checklist");
}

export async function renameChecklistCategory(group: string, from: string, to: string) {
  const trimmed = to.trim();
  if (!trimmed || trimmed === from) return;

  await prisma.checklistItem.updateMany({
    where: { group, category: from },
    data: { category: trimmed },
  });
  revalidatePath("/checklist");
}

export async function renameChecklistItem(itemId: string, label: string) {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return;
  await prisma.checklistItem.update({ where: { id: itemId }, data: { label: trimmedLabel } });
  revalidatePath("/checklist");
}

/**
 * Sets the answers an item can be given, or takes them away.
 *
 * An empty list means the item is only ticked off, which is the normal case;
 * it is stored as null rather than "[]" so the two cannot drift apart.
 */
export async function setChecklistItemOptions(itemId: string, options: string[]) {
  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { options: cleaned.length ? JSON.stringify(cleaned) : null },
  });
  revalidatePath("/checklist");
}

/**
 * Renames a group, which is to say every item filed under it.
 *
 * A group has no row of its own — it is the word its items carry — so renaming
 * one is a rewrite of them all, and a name already in use simply merges the two.
 */
export async function renameChecklistGroup(group: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === group) return;
  await prisma.checklistItem.updateMany({ where: { group }, data: { group: trimmed } });
  revalidatePath("/checklist");
}

/**
 * Deletes the lines given, by id.
 *
 * A group and a heading have no rows of their own — they are the words their
 * lines carry — so deleting one is deleting those, and the trade ideas written
 * under them go too, by the cascade on the relation.
 *
 * By id rather than by name, which was a race: clicking the delete button
 * first blurs the title field, the blur saves a rename, and the deletion that
 * followed looked for a name nothing carried any more — the section survived,
 * renamed, and clicking delete again did nothing either. No rename can move an
 * id, and an id is what the button actually knows.
 */
export async function deleteChecklistItems(ids: string[]) {
  if (!ids.length) return;
  await prisma.checklistItem.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/checklist");
}

/**
 * The setup a line only applies to, or none.
 *
 * A line given a setup is shown while that setup is being traded and hidden
 * otherwise: during a trend run, the rules of a reverse are noise.
 */
export async function setChecklistItemSetup(itemId: string, setup: string | null) {
  await prisma.checklistItem.update({ where: { id: itemId }, data: { setup } });
  revalidatePath("/checklist");
}

/** Whether trade ideas can be written under this item. */
export async function setChecklistItemAllowsIdeas(itemId: string, allowsIdeas: boolean) {
  await prisma.checklistItem.update({ where: { id: itemId }, data: { allowsIdeas } });
  revalidatePath("/checklist");
}

export async function deleteChecklistItem(itemId: string) {
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath("/checklist");
}
