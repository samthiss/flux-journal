"use server";

import { prisma } from "@/lib/prisma";
import { exigeProprietaire, monJournal } from "@/lib/session";
import { revalidatePath } from "next/cache";

/**
 * The configuration a symbol's report is read with: one of its best, or the
 * best itself when null. The reports themselves are put in place at start
 * (scripts/seed-databento.ts): the analysis runs on the trader's machine.
 */
export async function chooseDatabentoConfig(symbol: string, key: string | null) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  await prisma.databentoSymbol.updateMany({ where: { ownerId, symbol: symbol.trim().toUpperCase() }, data: { chosenKey: key } });
  revalidatePath("/backtesting-databento");
}

/** A level switched off, or back on: out of the Trading Plan, the journal form and the backtest figures. */
export async function setZoneDisabled(symbol: string, zone: number, disabled: boolean) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  const row = await prisma.databentoSymbol.findFirst({ where: { ownerId, symbol: symbol.trim().toUpperCase() } });
  if (!row || !Number.isFinite(zone)) return;
  let list: number[] = [];
  try {
    list = JSON.parse(row.disabledZones) as number[];
  } catch {
    list = [];
  }
  const rest = list.filter((z) => Math.abs(z - zone) > 1e-9);
  await prisma.databentoSymbol.update({ where: { id: row.id }, data: { disabledZones: JSON.stringify(disabled ? [...rest, zone] : rest) } });
  revalidatePath("/backtesting-databento");
  revalidatePath("/trading-plan");
  revalidatePath("/trade/new");
}
