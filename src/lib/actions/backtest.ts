"use server";

import { prisma } from "@/lib/prisma";
import { exigeProprietaire, monJournal } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type BacktestInput = {
  date: string;
  testName: string;
  symbol: string;
  slTicks: number;
  tp1Ticks: number;
  tp2Ticks: number;
  lots: number;
  entryOffset: number;
  result: string;
  note: string;
};

const RESULTS = ["SL", "TP1", "TP2", "BE"];

/**
 * A day, kept at noon UTC.
 *
 * The test is filed by month, and a midnight stored from a browser east of
 * Greenwich would land on the last day of the month before.
 */
function jour(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date invalide.");
  return new Date(`${date}T12:00:00Z`);
}

export async function addBacktestTrade(input: BacktestInput) {
  await exigeProprietaire();
  const ownerId = await monJournal();

  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new Error("Symbole manquant.");
  if (!RESULTS.includes(input.result)) throw new Error("Résultat invalide.");
  const sl = Math.abs(Number(input.slTicks));
  const tp1 = Math.abs(Number(input.tp1Ticks));
  const tp2 = Math.abs(Number(input.tp2Ticks));
  if (!Number.isFinite(sl) || sl <= 0) throw new Error("Le SL doit être un nombre de ticks positif.");
  if (!Number.isFinite(tp1) || tp1 <= 0) throw new Error("TP1 doit être un nombre de ticks positif.");
  if (!Number.isFinite(tp2) || tp2 < tp1) throw new Error("TP2 doit être au moins aussi loin que TP1.");
  const lots = Number(input.lots);
  if (!Number.isFinite(lots) || lots <= 0) throw new Error("Le nombre de lots doit être positif.");
  const offset = Number(input.entryOffset) || 0;

  const row = await prisma.backtestTrade.create({
    data: {
      ownerId,
      date: jour(input.date),
      testName: input.testName.trim() || null,
      symbol,
      // One strategy is tested, and in both directions alike: neither is asked.
      strategy: "",
      side: null,
      slTicks: sl,
      tp1Ticks: tp1,
      tp2Ticks: tp2,
      lots,
      entryOffset: offset,
      result: input.result,
      note: input.note.trim() || null,
    },
  });
  revalidatePath("/backtesting");
  return { ...row, date: row.date.toISOString(), createdAt: row.createdAt.toISOString() };
}

export async function deleteBacktestTrades(ids: string[]) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  // Scoped by journal: an id from somebody else's rows deletes nothing.
  await prisma.backtestTrade.deleteMany({ where: { ownerId, id: { in: ids } } });
  revalidatePath("/backtesting");
}

/** Takes a test's name off its rows; the rows themselves stay, untagged. */
export async function removeBacktestTag(testName: string) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  await prisma.backtestTrade.updateMany({ where: { ownerId, testName }, data: { testName: null } });
  revalidatePath("/backtesting");
}

/** Deletes every row filed under a test's name. */
export async function deleteBacktestTest(testName: string) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  await prisma.backtestTrade.deleteMany({ where: { ownerId, testName } });
  revalidatePath("/backtesting");
}
