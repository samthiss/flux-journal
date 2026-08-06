"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getChecklistForToday() {
  const date = todayDate();
  const items = await prisma.checklistItem.findMany({ orderBy: { order: "asc" } });
  const logs = await prisma.checklistLog.findMany({ where: { date } });
  const logByItem = new Map(logs.map((l) => [l.itemId, l.checked]));

  return items.map((item) => ({
    ...item,
    checked: logByItem.get(item.id) ?? false,
  }));
}

export async function toggleChecklistItem(itemId: string, checked: boolean) {
  const date = todayDate();
  await prisma.checklistLog.upsert({
    where: { date_itemId: { date, itemId } },
    update: { checked },
    create: { date, itemId, checked },
  });
  revalidatePath("/checklist");
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
  await prisma.checklistLog.deleteMany({ where: { itemId } });
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath("/checklist");
}
