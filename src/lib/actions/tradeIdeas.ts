"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { TRADE_TYPES, ZONES, parseTagArray } from "@/lib/tags";

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
  zone: string | null;
  confirmations: string[];
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
      zone: input.zone?.trim() || null,
      confirmations: input.confirmations.length ? JSON.stringify(input.confirmations) : null,
      reason,
    },
  });
  revalidatePath("/checklist");
  return idea;
}

/** Takes one chart off an idea. The file itself is left where it is. */
export async function removeTradeIdeaImage(id: string, url: string) {
  const idea = await prisma.tradeIdea.findUnique({ where: { id } });
  if (!idea) return;
  let images: { url: string }[] = [];
  try {
    const parsed = JSON.parse(idea.images ?? "[]");
    if (Array.isArray(parsed)) images = parsed;
  } catch {
    return;
  }
  const kept = images.filter((image) => image?.url !== url);
  await prisma.tradeIdea.update({
    where: { id },
    data: { images: kept.length ? JSON.stringify(kept) : null },
  });
  revalidatePath("/checklist");
}

export async function deleteTradeIdea(id: string) {
  await prisma.tradeIdea.delete({ where: { id } });
  revalidatePath("/checklist");
}

/**
 * The words to offer, which are the ones the notes already use.
 *
 * There is no table of tags — a word exists as long as something carries it —
 * so each list is read off the examples and the ideas together, minus the ones
 * the reader removed, with any that ship with the app at the head. That is the
 * same rule the notes page applies, so both pages offer the same words and one
 * typed on an idea is there for the next example.
 */
export async function getTradeVocabularies() {
  const [examples, ideas, hidden] = await Promise.all([
    prisma.noteExample.findMany({ select: { tradeTypes: true, zone: true, confirmations: true } }),
    prisma.tradeIdea.findMany({ select: { tradeTypes: true, zone: true, confirmations: true } }),
    prisma.hiddenTagOption.findMany({ select: { kind: true, value: true } }),
  ]);

  const removed = (kind: string) =>
    new Set(hidden.filter((h) => h.kind === kind).map((h) => h.value));

  // Most-used first, then alphabetical, so the order does not shuffle between
  // two renders; the shipped words keep the head of their list whatever the
  // counts say.
  const rank = (values: string[], shipped: readonly string[], hiddenValues: Set<string>) => {
    const counts = new Map<string, number>();
    for (const value of values) {
      const v = value.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const used = [...counts.entries()]
      .filter(([value]) => !shipped.includes(value))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value]) => value);
    return [...shipped, ...used].filter((value) => !hiddenValues.has(value));
  };

  const rows = [...examples, ...ideas];
  return {
    tradeTypes: rank(rows.flatMap((r) => parseTagArray(r.tradeTypes)), TRADE_TYPES, removed("tradeTypes")),
    zones: rank(rows.map((r) => r.zone ?? "").filter(Boolean), ZONES, removed("zone")),
    // Confirmations are the reader's own words from the start: nothing ships.
    confirmations: rank(rows.flatMap((r) => parseTagArray(r.confirmations)), [], removed("confirmations")),
  };
}
