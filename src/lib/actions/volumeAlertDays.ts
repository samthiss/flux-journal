"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { AlertDay } from "@/lib/volumeAlerts";

/** Everything recorded, newest day first. */
export async function getAlertDays(): Promise<AlertDay[]> {
  const rows = await prisma.volumeAlertDay.findMany({ orderBy: { day: "desc" } });

  return rows.map((row) => ({
    day: row.day,
    threshold: row.threshold,
    market: row.market,
    values: parseValues(row.values),
  }));
}

/** The hours as typed: anything that is not a positive number is dropped. */
function parseValues(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  } catch {
    return [];
  }
}

/**
 * Write one day down, or correct it.
 *
 * Filling the same day twice replaces it rather than adding to it: the second
 * entry is someone remembering the day better, not a second day.
 */
export async function saveAlertDay(input: { day: string; threshold: number; values: number[]; market: string }) {
  const { day, threshold, market } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  if (!Number.isFinite(threshold) || threshold <= 0) return;

  const values = input.values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a);

  await prisma.volumeAlertDay.upsert({
    where: { market_day: { market, day } },
    create: { day, threshold: Math.round(threshold), values: JSON.stringify(values), market },
    update: { threshold: Math.round(threshold), values: JSON.stringify(values) },
  });
  revalidatePath("/volume-alert");
}

export async function deleteAlertDay(market: string, day: string) {
  await prisma.volumeAlertDay.deleteMany({ where: { market, day } });
  revalidatePath("/volume-alert");
}
