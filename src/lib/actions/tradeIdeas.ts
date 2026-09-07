"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { TRADE_TYPES, parseTagArray } from "@/lib/tags";

/**
 * The trade ideas written for one market on one day.
 *
 * Both are needed: the checklist is redone every morning, and a plan for the ES
 * says nothing about the 6E. Yesterday's ideas are not deleted, they are simply
 * not today's — which is what makes them worth keeping.
 */
export async function getTradeIdeas(market: string, day: string) {
  return prisma.tradeIdea.findMany({
    where: { market, day },
    orderBy: { createdAt: "asc" },
  });
}

export async function createTradeIdea(input: {
  itemId: string;
  market: string;
  day: string;
  side: string;
  tradeTypes: string[];
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) return null;

  const idea = await prisma.tradeIdea.create({
    data: {
      itemId: input.itemId,
      market: input.market,
      day: input.day,
      side: input.side === "short" ? "short" : "long",
      tradeTypes: input.tradeTypes.length ? JSON.stringify(input.tradeTypes) : null,
      reason,
    },
  });
  revalidatePath("/checklist");
  return idea;
}

export async function deleteTradeIdea(id: string) {
  await prisma.tradeIdea.delete({ where: { id } });
  revalidatePath("/checklist");
}

/**
 * The trade types to offer, which are the ones the notes already use.
 *
 * There is no table of tags — a word exists as long as something carries it —
 * so the list is read off the examples and the ideas together, minus the ones
 * the reader removed, with the five that ship with the app at the head. That is
 * the same rule the notes page applies, so both pages offer the same words.
 */
export async function getTradeTypeVocabulary() {
  const [examples, ideas, hidden] = await Promise.all([
    prisma.noteExample.findMany({ where: { tradeTypes: { not: null } }, select: { tradeTypes: true } }),
    prisma.tradeIdea.findMany({ where: { tradeTypes: { not: null } }, select: { tradeTypes: true } }),
    prisma.hiddenTagOption.findMany({ where: { kind: "tradeTypes" }, select: { value: true } }),
  ]);

  const removed = new Set(hidden.map((h) => h.value));
  const counts = new Map<string, number>();
  for (const row of [...examples, ...ideas]) {
    for (const value of parseTagArray(row.tradeTypes)) {
      const v = value.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }

  // Most-used first among the ones written by hand, then alphabetical, so the
  // order does not shuffle between two renders.
  const used = [...counts.entries()]
    .filter(([value]) => !(TRADE_TYPES as readonly string[]).includes(value))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);

  return [...TRADE_TYPES, ...used].filter((value) => !removed.has(value));
}
