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

export async function deleteChecklistItem(itemId: string) {
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath("/checklist");
}
