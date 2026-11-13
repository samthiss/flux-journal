"use server";

import { prisma } from "@/lib/prisma";
import { exigeProprietaire, monJournal } from "@/lib/session";
import { revalidatePath } from "next/cache";

const clean = (symbol: string) => symbol.trim().toUpperCase();

/** The levels of one symbol, replacing those it had. */
export async function saveDatabentoZones(symbol: string, zones: number[]) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  const s = clean(symbol);
  if (!s) throw new Error("Symbole manquant.");
  const kept = [...new Set(zones.filter((z) => Number.isFinite(z) && z > 0))].sort((a, b) => a - b);
  await prisma.databentoSymbol.upsert({
    where: { ownerId_symbol: { ownerId, symbol: s } },
    create: { ownerId, symbol: s, zones: JSON.stringify(kept) },
    update: { zones: JSON.stringify(kept) },
  });
  revalidatePath("/backtesting-databento");
  return kept;
}

/**
 * The last analysis of one symbol.
 *
 * Sent as text and stored as text: it is only ever read back whole by the
 * page that wrote it. The configuration chosen before is forgotten, since it
 * may not be among the new results.
 */
export async function saveDatabentoResult(symbol: string, result: string) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  const s = clean(symbol);
  if (result.length > 2_000_000) throw new Error("Résultat trop volumineux.");
  JSON.parse(result);
  await prisma.databentoSymbol.upsert({
    where: { ownerId_symbol: { ownerId, symbol: s } },
    create: { ownerId, symbol: s, result },
    update: { result, chosenKey: null },
  });
  revalidatePath("/backtesting-databento");
}

export async function chooseDatabentoConfig(symbol: string, key: string | null) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  await prisma.databentoSymbol.updateMany({ where: { ownerId, symbol: clean(symbol) }, data: { chosenKey: key } });
  revalidatePath("/backtesting-databento");
}

/** Forgets a symbol: its levels and its analysis. The bars in the browser are the page's to delete. */
export async function deleteDatabentoSymbol(symbol: string) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  await prisma.databentoSymbol.deleteMany({ where: { ownerId, symbol: clean(symbol) } });
  revalidatePath("/backtesting-databento");
}
