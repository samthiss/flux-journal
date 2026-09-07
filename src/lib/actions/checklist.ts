"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Only the item definitions live in the database. Which items are ticked is
// per-device state held in localStorage by the checklist components, so there
// is deliberately no server-side "checked" concept here.
export async function getChecklistItems() {
  return prisma.checklistItem.findMany({ orderBy: { order: "asc" } });
}

export async function createChecklistItem(group: string, label: string) {
  const trimmedGroup = group.trim();
  const trimmedLabel = label.trim();
  if (!trimmedGroup || !trimmedLabel) return;

  const last = await prisma.checklistItem.findFirst({
    orderBy: { order: "desc" },
  });

  await prisma.checklistItem.create({
    data: { group: trimmedGroup, label: trimmedLabel, order: (last?.order ?? -1) + 1 },
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

/** Whether trade ideas can be written under this item. */
export async function setChecklistItemAllowsIdeas(itemId: string, allowsIdeas: boolean) {
  await prisma.checklistItem.update({ where: { id: itemId }, data: { allowsIdeas } });
  revalidatePath("/checklist");
}

export async function deleteChecklistItem(itemId: string) {
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath("/checklist");
}
