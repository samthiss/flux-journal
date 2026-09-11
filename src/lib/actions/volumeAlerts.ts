"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { AlertHour } from "@/lib/volumeAlerts";

/** Everything recorded, newest day first. */
export async function getAlertHours(): Promise<AlertHour[]> {
  const rows = await prisma.volumeAlertHour.findMany({
    orderBy: [{ day: "desc" }, { hour: "asc" }],
  });

  return rows.map((row) => ({
    day: row.day,
    hour: row.hour,
    threshold: row.threshold,
    market: row.market,
    values: parseValues(row.values),
  }));
}

/** The boxes as typed: anything that is not a positive number is dropped. */
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
 * Write one hour down, or correct it.
 *
 * Filling the same hour twice replaces it rather than adding to it: the second
 * entry is someone remembering the hour better, not a second hour.
 */
export async function saveAlertHour(input: {
  day: string;
  hour: number;
  threshold: number;
  values: number[];
  market: string;
}) {
  const { day, hour, threshold, market } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
  if (!Number.isFinite(threshold) || threshold <= 0) return;

  const values = input.values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a);

  await prisma.volumeAlertHour.upsert({
    where: { market_day_hour: { market, day, hour } },
    create: { day, hour, threshold: Math.round(threshold), values: JSON.stringify(values), market },
    update: { threshold: Math.round(threshold), values: JSON.stringify(values) },
  });
  revalidatePath("/volume-alert");
}

export async function deleteAlertHour(market: string, day: string, hour: number) {
  await prisma.volumeAlertHour.deleteMany({ where: { market, day, hour } });
  revalidatePath("/volume-alert");
}
