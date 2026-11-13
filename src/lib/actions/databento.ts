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
