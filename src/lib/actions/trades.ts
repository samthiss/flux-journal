"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CHART_SLOTS } from "@/lib/chartSlots";
import { deleteImageFileIfUnused, deleteImageFilesIfUnused } from "@/lib/imageFiles";
import { sniffImageType } from "@/lib/imageType";
import { UPLOAD_DIR } from "@/lib/uploadDir";

async function saveImage(file: File): Promise<string> {
  // Same rule as /api/uploads: what a file claims to be comes from the request,
  // so the first bytes decide whether it is kept and under what extension —
  // that extension is what the serving route turns back into a Content-Type.
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(buffer);
  if (!type) throw new Error("Ce fichier n'est pas une image PNG, JPEG, WebP ou GIF.");

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${type.ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `/api/uploads/${filename}`;
}

async function parseChartFields(formData: FormData) {
  const fields: Record<string, string> = {};
  for (const slot of CHART_SLOTS) {
    const file = formData.get(`chart_${slot.key}`);
    if (file instanceof File && file.size > 0) {
      fields[slot.field] = await saveImage(file);
    }
  }
  return fields;
}

function parseTradeForm(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "") || null;
  const symbol = String(formData.get("symbol") ?? "");
  const market = String(formData.get("market") ?? "") || null;
  const side = String(formData.get("side") ?? "Long");
  const size = parseFloat(String(formData.get("size") ?? "0")) || 0;
  const pnl = parseFloat(String(formData.get("pnl") ?? "0")) || 0;
  // The risk is what gets typed; the reward-to-risk falls out of it, so a trade
  // can no longer be saved with a P&L and an R:R that contradict each other.
  const riskInput = formData.get("risk") ? parseFloat(String(formData.get("risk"))) : null;
  const risk = riskInput && Number.isFinite(riskInput) && riskInput !== 0 ? Math.abs(riskInput) : null;
  const rr = risk ? Number((pnl / risk).toFixed(2)) : null;
  const setup = String(formData.get("setup") ?? "");
  const emotion = String(formData.get("emotion") ?? "") || null;
  const preTradeNotes = String(formData.get("preTradeNotes") ?? "") || null;
  const postTradeNotes = String(formData.get("postTradeNotes") ?? "") || null;

  return { date, time, symbol, market, side, size, pnl, risk, rr, setup, emotion, preTradeNotes, postTradeNotes };
}

export async function createTrade(formData: FormData) {
  const data = parseTradeForm(formData);
  const chartFields = await parseChartFields(formData);

  const trade = await prisma.trade.create({
    data: {
      ...data,
      date: new Date(data.date),
      ...chartFields,
    },
  });

  revalidatePath("/");
  revalidatePath("/trades");
  redirect(`/trades/${trade.id}`);
}

export async function updateTrade(tradeId: string, formData: FormData) {
  const data = parseTradeForm(formData);
  const chartFields = await parseChartFields(formData);

  // Replacing a chart used to leave the old file on the volume for good: the
  // column moved on and nothing else remembered the name. Read the outgoing
  // URLs before they are overwritten, and sweep them once the row is saved.
  const replacedSlots = Object.keys(chartFields);
  const previous = replacedSlots.length
    ? await prisma.trade.findUnique({ where: { id: tradeId } })
    : null;

  await prisma.trade.update({
    where: { id: tradeId },
    data: {
      ...data,
      date: new Date(data.date),
      ...chartFields,
    },
  });

  if (previous) {
    const outgoing = previous as unknown as Record<string, string | null>;
    await deleteImageFilesIfUnused(replacedSlots.map((field) => outgoing[field]));
  }

  revalidatePath("/");
  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
  redirect(`/trades/${tradeId}`);
}

export async function removeChartSlot(tradeId: string, slotKey: string) {
  const slot = CHART_SLOTS.find((s) => s.key === slotKey);
  if (!slot) return;

  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return;

  const current = (trade as unknown as Record<string, string | null>)[slot.field];
  // Clear the column first: the file is only removed once nothing points at it,
  // and this trade is one of the things that points at it.
  await prisma.trade.update({ where: { id: tradeId }, data: { [slot.field]: null } });
  await deleteImageFileIfUnused(current);

  revalidatePath(`/trades/${tradeId}/edit`);
  revalidatePath(`/trades/${tradeId}`);
}

export async function deleteTrade(tradeId: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (trade) {
    const charts = CHART_SLOTS.map((slot) => (trade as unknown as Record<string, string | null>)[slot.field]);
    // The trade goes first, so that a chart a note imported is still spoken for
    // when the files are swept: the note keeps the image it was shown.
    await prisma.trade.delete({ where: { id: tradeId } });
    await deleteImageFilesIfUnused(charts);
  }
  revalidatePath("/");
  revalidatePath("/trades");
  redirect("/trades");
}
