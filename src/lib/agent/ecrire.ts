"use server";

/**
 * The one thing the agent can change, and only once a person has clicked.
 *
 * The agent never calls this. It proposes a line through its `proposer_ajout`
 * tool, the page draws that as a draft, and this runs from the button — so a
 * model that misunderstands produces a bad suggestion, never a bad note.
 *
 * Appends only. Rewriting or deleting a rule stays manual, in Notes, because
 * those are the changes nobody notices: a rule silently reworded is quoted back
 * months later as one's own words.
 */

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

type RuleItem = { title?: string; details?: string[] };

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function ajouterLigne(input: { note: string; section: string; ligne: string }): Promise<string> {
  const ligne = input.ligne.trim();
  const section = input.section.trim() || "Règles";
  if (!ligne) return "Rien à ajouter.";

  const wanted = fold(input.note.split(">").pop() ?? input.note);
  const notes = await prisma.note.findMany({ select: { id: true, title: true } });
  const note = notes.find((n) => fold(n.title) === wanted) ?? notes.find((n) => fold(n.title).includes(wanted));
  if (!note) return `Aucune note ne correspond à « ${input.note} ».`;

  // The rules of a note can hang off the note or off one of its categories;
  // either is a place the reader would recognise, so the first one found wins.
  const blocks = await prisma.noteBlock.findMany({
    where: { type: "regles", OR: [{ noteId: note.id }, { category: { noteId: note.id } }] },
    orderBy: { order: "asc" },
    select: { id: true, content: true },
  });

  /**
   * The section, tried as a path before being taken as a name.
   *
   * The agent answers where a line belongs the way it reads the journal out
   * loud — "Entry - Exits › Entry" — and taking that whole string as a title
   * created a second section named after the path, in whichever block came
   * first. Matching the last segment lands it under the Entry that exists.
   */
  const segments = section.split(/[›>]/).map((part) => part.trim()).filter(Boolean).reverse();

  let cible = blocks[0];
  let titre = segments[0] ?? section;

  chercher: for (const segment of segments) {
    for (const block of blocks) {
      const existante = lireItems(block.content).find((item) => fold(item.title ?? "") === fold(segment));
      if (existante) {
        cible = block;
        titre = existante.title ?? segment;
        break chercher;
      }
    }
  }

  if (!cible) {
    // No rules block at all: one is created on the note rather than refusing.
    await prisma.noteBlock.create({
      data: {
        noteId: note.id,
        type: "regles",
        content: JSON.stringify([{ title: titre, details: [ligne] }]),
        order: 0,
      },
    });
  } else {
    const items = lireItems(cible.content);
    const existante = items.find((item) => fold(item.title ?? "") === fold(titre));

    if (existante) existante.details = [...(existante.details ?? []), ligne];
    else items.push({ title: titre, details: [ligne] });

    await prisma.noteBlock.update({
      where: { id: cible.id },
      // Written back in the shape it was read in: a note edited by hand
      // afterwards has to look like every other note.
      data: { content: JSON.stringify(reecrire(cible.content, items)) },
    });
  }

  await prisma.agentAddition.create({
    data: { note: note.title, section: titre, ligne },
  });

  revalidatePath("/notes");
  return `Ajouté dans ${note.title} › ${titre}.`;
}

function lireItems(content: string | null): RuleItem[] {
  try {
    const parsed = JSON.parse(content ?? "[]");
    if (Array.isArray(parsed)) return parsed as RuleItem[];
    if (parsed && typeof parsed === "object") return ((parsed as { items?: RuleItem[] }).items ?? []) as RuleItem[];
  } catch {
    // An unreadable block is left alone: better a refused addition than a
    // rewritten rule.
  }
  return [];
}

/** The same envelope the block had — a bare list, or a labelled one. */
function reecrire(content: string | null, items: RuleItem[]): unknown {
  try {
    const parsed = JSON.parse(content ?? "[]");
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      return { ...(parsed as object), items };
    }
  } catch {
    // Falls through to the bare list.
  }
  return items;
}
