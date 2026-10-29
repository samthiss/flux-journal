"use server";

import { prisma } from "@/lib/prisma";

/**
 * How the trades list was last left, and what a visitor opens on.
 *
 * The filters are a way of looking at the journal, and sharing it means
 * sharing the look: a link sent to make a point about the reverses should
 * open on the reverses, not on everything with the point left to a covering
 * message.
 *
 * One row, the owner's. A guest's session cannot POST at all, so nobody else
 * can write it.
 */
export async function enregistrerVue(filtres: Record<string, string>) {
  const propre = Object.fromEntries(
    Object.entries(filtres)
      .filter(([cle, valeur]) => typeof valeur === "string" && cle.length < 40 && valeur.length < 120)
      .slice(0, 30)
  );
  await prisma.sharedView.upsert({
    where: { id: "default" },
    create: { id: "default", filters: JSON.stringify(propre) },
    update: { filters: JSON.stringify(propre) },
  });
}

/** What was saved, or nothing — in which case the list opens as it always did. */
export async function lireVue(): Promise<Record<string, string>> {
  const vue = await prisma.sharedView.findUnique({ where: { id: "default" } });
  if (!vue) return {};
  try {
    const parsed = JSON.parse(vue.filters);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
