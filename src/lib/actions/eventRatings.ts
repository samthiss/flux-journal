"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * The ratings this journal keeps for itself, over the calendar source's own.
 *
 * The source rates the indicator: what has no consensus figure — an auction, a
 * closed market, a press conference — cannot surprise anyone, so it is filed
 * as unimportant however hard it moves the tape. These rows say otherwise.
 */
export async function getEventRatings(): Promise<Record<string, string>> {
  const rows = await prisma.eventRating.findMany();
  return Object.fromEntries(rows.map((r) => [`${r.currency}|${r.title}`, r.impact]));
}

export async function setEventRating(currency: string, title: string, impact: string) {
  if (!["high", "medium", "low"].includes(impact)) return;

  await prisma.eventRating.upsert({
    where: { currency_title: { currency, title } },
    // Set by hand, so it outbids the transcription and survives the next deploy.
    create: { currency, title, impact, source: "moi" },
    update: { impact, source: "moi" },
  });
  revalidatePath("/checklist");
}
