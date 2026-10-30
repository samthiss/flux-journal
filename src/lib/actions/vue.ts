"use server";

import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";

/**
 * How the trades list was last left, and what a visitor opens on.
 *
 * The filters are a way of looking at the journal, and sharing it means
 * sharing the look: a link sent to make a point about the reverses should
 * open on the reverses, not on everything with the point left to a covering
 * message.
 *
 * One row per journal, and the row written is the one of whoever is asking —
 * an account arranges its own list and shares its own view.
 */
export async function enregistrerVue(filtres: Record<string, string>) {
  const ownerId = await monJournal();
  const propre = Object.fromEntries(
    Object.entries(filtres)
      .filter(([cle, valeur]) => typeof valeur === "string" && cle.length < 40 && valeur.length < 120)
      .slice(0, 30)
  );
  await prisma.sharedView.upsert({
    where: { ownerId },
    create: { ownerId, filters: JSON.stringify(propre) },
    update: { filters: JSON.stringify(propre) },
  });
}

/** What was saved, or nothing — in which case the list opens as it always did. */
export async function lireVue(ownerId: string): Promise<Record<string, string>> {
  const vue = await prisma.sharedView.findUnique({ where: { ownerId } });
  if (!vue) return {};
  try {
    const parsed = JSON.parse(vue.filters);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
