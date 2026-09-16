"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { TRADE_TYPES, ZONES, parseTagArray, kindDeBase, kindPourSetup } from "@/lib/tags";

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

/**
 * Moves an idea along: plan, position, closed.
 *
 * Which page shows it follows from this — the strategies, the discipline list,
 * then the post-mortem — so these are the gestures that say a trade was taken
 * and then finished.
 */
export async function setTradeIdeaStatus(id: string, status: "plan" | "position" | "closed") {
  await prisma.tradeIdea.update({ where: { id }, data: { status } });
  revalidatePath("/checklist");
}

/**
 * Files the words an idea carries under the setup it was written for.
 *
 * Typing a word remembers it as it is typed, but ticking one that already
 * exists remembered nothing — so a list written before the setups existed
 * stayed setup-less however often it was used, and the scoped list stayed
 * empty, which kept the whole vocabulary showing for ever. Saving is the
 * moment a word and a setup are known to go together, so that is where it is
 * recorded.
 */
async function classerParSetup(setup: string | null, listes: Record<string, string[]>) {
  if (!setup) return;
  for (const [kind, mots] of Object.entries(listes)) {
    for (const mot of mots) {
      const value = mot.trim();
      if (!value) continue;
      await prisma.tagOption.upsert({
        where: { kind_value: { kind: kindPourSetup(kind, setup), value } },
        create: { kind: kindPourSetup(kind, setup), value },
        update: {},
      });
    }
  }
}

export async function createTradeIdea(input: {
  itemId: string;
  market: string;
  day: string;
  side: string;
  /**
   * Which setup this idea is for.
   *
   * Offered by the line it is written under and kept unless the writer turns
   * it off — `null` is a decision, not a gap, so it is taken as written rather
   * than filled back in from the line.
   */
  setup: string | null;
  tradeTypes: string[];
  zone: string | null;
  confirmations: string[];
  confirmationsBox: string[];
  confirmationsReverse: string[];
  reason: string;
  cancelIf: string[];
  /** Charts picked in the form, uploaded once this row exists. */
  withImages?: boolean;
}) {
  const reason = input.reason.trim();
  const cancelIf = input.cancelIf.map((line) => line.trim()).filter(Boolean);

  // An idea is worth keeping as soon as anything was said about it: a direction
  // with two tags and what would cancel it is a plan, prose or no prose. Only a
  // form with nothing in it at all is refused, so a stray click writes nothing.
  const empty =
    !reason &&
    !input.tradeTypes.length &&
    !input.zone?.trim() &&
    !input.confirmations.length &&
    !input.confirmationsBox.length &&
    !input.confirmationsReverse.length &&
    !cancelIf.length &&
    !input.withImages;
  if (empty) return null;

  const idea = await prisma.tradeIdea.create({
    data: {
      itemId: input.itemId,
      setup: input.setup,
      market: input.market,
      day: input.day,
      side: input.side === "short" ? "short" : "long",
      tradeTypes: input.tradeTypes.length ? JSON.stringify(input.tradeTypes) : null,
      zone: input.zone?.trim() || null,
      confirmations: input.confirmations.length ? JSON.stringify(input.confirmations) : null,
      confirmationsBox: input.confirmationsBox.length ? JSON.stringify(input.confirmationsBox) : null,
      confirmationsReverse: input.confirmationsReverse.length ? JSON.stringify(input.confirmationsReverse) : null,
      reason,
      cancelIf: cancelIf.length ? JSON.stringify(cancelIf) : null,
    },
  });
  await classerParSetup(input.setup, {
    confirmations: input.confirmations,
    confirmationsBox: input.confirmationsBox,
    confirmationsReverse: input.confirmationsReverse,
  });
  revalidatePath("/checklist");
  return idea;
}

/**
 * Rewrites an idea, keeping the charts already on it.
 *
 * A plan changes as the morning does — the direction flips, a confirmation is
 * dropped, a condition is added — and rewriting it should not mean deleting it
 * and typing the rest again.
 */
export async function updateTradeIdea(
  id: string,
  input: {
    side: string;
    setup: string | null;
    tradeTypes: string[];
    zone: string | null;
    confirmations: string[];
    confirmationsBox: string[];
    confirmationsReverse: string[];
    reason: string;
    cancelIf: string[];
  }
) {
  const cancelIf = input.cancelIf.map((line) => line.trim()).filter(Boolean);
  await prisma.tradeIdea.update({
    where: { id },
    data: {
      side: input.side === "short" ? "short" : "long",
      setup: input.setup,
      tradeTypes: input.tradeTypes.length ? JSON.stringify(input.tradeTypes) : null,
      zone: input.zone?.trim() || null,
      confirmations: input.confirmations.length ? JSON.stringify(input.confirmations) : null,
      confirmationsBox: input.confirmationsBox.length ? JSON.stringify(input.confirmationsBox) : null,
      confirmationsReverse: input.confirmationsReverse.length ? JSON.stringify(input.confirmationsReverse) : null,
      reason: input.reason.trim(),
      cancelIf: cancelIf.length ? JSON.stringify(cancelIf) : null,
    },
  });
  await classerParSetup(input.setup, {
    confirmations: input.confirmations,
    confirmationsBox: input.confirmationsBox,
    confirmationsReverse: input.confirmationsReverse,
  });
  revalidatePath("/checklist");
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
/**
 * Remembers a word the moment it is written, not when it is saved.
 *
 * The vocabularies used to be read back off the ideas that carried them, so a
 * confirmation typed and then unticked before saving was lost — and got typed
 * again, differently, on the next trade. Two spellings of one confirmation
 * cannot be counted together afterwards.
 */
export async function ajouterMot(kind: string, value: string) {
  const mot = value.trim();
  if (!mot) return;
  await prisma.tagOption.upsert({
    where: { kind_value: { kind, value: mot } },
    create: { kind, value: mot },
    update: {},
  });
}

/** Drops a word from the list offered. Ideas that used it keep their own copy. */
export async function supprimerMot(kind: string, value: string) {
  await prisma.tagOption.deleteMany({ where: { kind, value } });
  revalidatePath("/checklist");
}

/**
 * Renames a word, and rewrites it on the ideas that carry it.
 *
 * Both halves matter: renaming only the list would leave the old spelling on
 * past trades and put the new one beside it, which is the very split the list
 * exists to prevent.
 */
export async function renommerMot(kind: string, from: string, to: string) {
  const nouveau = to.trim();
  if (!nouveau || nouveau === from) return;

  await prisma.tagOption.deleteMany({ where: { kind, value: from } });
  await prisma.tagOption.upsert({
    where: { kind_value: { kind, value: nouveau } },
    create: { kind, value: nouveau },
    update: {},
  });

  // The word lives in whichever list it was written in — the three
  // confirmation lists and the cancel conditions are each their own.
  const CHAMPS: Record<string, "cancelIf" | "confirmations" | "confirmationsBox" | "confirmationsReverse"> = {
    cancelIf: "cancelIf",
    confirmations: "confirmations",
    confirmationsBox: "confirmationsBox",
    confirmationsReverse: "confirmationsReverse",
  };
  const champ = CHAMPS[kindDeBase(kind)] ?? "confirmations";
  const ideas = await prisma.tradeIdea.findMany({
    select: { id: true, confirmations: true, confirmationsBox: true, confirmationsReverse: true, cancelIf: true },
  });
  for (const idea of ideas) {
    const mots = parseTagArray(idea[champ]);
    if (!mots.includes(from)) continue;
    const remplacés = [...new Set(mots.map((mot) => (mot === from ? nouveau : mot)))];
    await prisma.tradeIdea.update({
      where: { id: idea.id },
      data: { [champ]: JSON.stringify(remplacés) },
    });
  }
  revalidatePath("/checklist");
}

export async function getTradeVocabularies() {
  const [examples, ideas, hidden, ajoutes, trades] = await Promise.all([
    prisma.noteExample.findMany({
      select: {
        tradeTypes: true,
        zone: true,
        setup: true,
        confirmations: true,
        confirmationsBox: true,
        confirmationsReverse: true,
        invalidReasons: true,
      },
    }),
    prisma.tradeIdea.findMany({ select: { tradeTypes: true, zone: true, confirmations: true, cancelIf: true } }),
    prisma.hiddenTagOption.findMany({ select: { kind: true, value: true } }),
    prisma.tagOption.findMany({ orderBy: { createdAt: "asc" }, select: { kind: true, value: true } }),
    prisma.trade.findMany({ select: { invalidReasons: true } }),
  ]);

  const removed = (kind: string) =>
    new Set(hidden.filter((h) => h.kind === kind).map((h) => h.value));

  /**
   * Words written down on their own, whether or not an idea kept them.
   *
   * A kind with no setup gathers every setup's words as well: it is the list
   * offered where no setup is in force, and a word written under one setup is
   * still a word this reader uses.
   */
  const ecrits = (kind: string) =>
    ajoutes
      .filter((mot) => (kind.includes("@") ? mot.kind === kind : kindDeBase(mot.kind) === kind))
      .map((mot) => mot.value);

  /**
   * The same three lists as annotated on the note examples.
   *
   * The two pages were deliberately unlinked once, when the checklist filled
   * with words from elsewhere that had never been typed there. What changed is
   * that both sides now hold the same three lists and the same setups, so a
   * word annotated on a trend run example is a word for a trend run here —
   * the suggestion is recognisable, which is what was wrong before.
   */
  const desNotes = (kind: string) => {
    const base = kindDeBase(kind);
    const setup = kind.includes("@") ? kind.slice(base.length + 1) : null;
    const champ = ({
      confirmations: (e: (typeof examples)[number]) => e.confirmations,
      confirmationsBox: (e: (typeof examples)[number]) => e.confirmationsBox,
      confirmationsReverse: (e: (typeof examples)[number]) => e.confirmationsReverse,
    } as Record<string, (e: (typeof examples)[number]) => string | null>)[base];
    if (!champ) return [];
    return examples
      .filter((e) => !setup || e.setup === setup)
      .flatMap((e) => parseTagArray(champ(e)));
  };

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
    /**
     * The words written in the pre-trade form, and the ones annotated on the
     * note examples: one vocabulary, read from both places it is written in.
     */
    confirmations: rank([...ecrits("confirmations"), ...desNotes("confirmations")], [], removed("confirmations")),
    // The two other charts, each remembering its own words the same way.
    confirmationsBox: rank([...ecrits("confirmationsBox"), ...desNotes("confirmationsBox")], [], removed("confirmationsBox")),
    confirmationsReverse: rank(
      [...ecrits("confirmationsReverse"), ...desNotes("confirmationsReverse")],
      [],
      removed("confirmationsReverse")
    ),
    /**
     * The same three lists, setup by setup: what a trend run is confirmed by
     * is not what a reverse is confirmed by. Keyed "list@setup"; a key with
     * nothing under it yet leaves the form falling back to the whole list,
     * rather than opening on an empty row that reads as a fault.
     */
    parSetup: Object.fromEntries(
      [
        ...new Set([
          ...ajoutes.map((mot) => mot.kind).filter((kind) => kind.includes("@")),
          // Every list × every setup the examples are annotated with, so a
          // word that only ever lived in the notes is offered here too.
          ...examples
            .filter((e) => e.setup)
            .flatMap((e) => ["confirmations", "confirmationsBox", "confirmationsReverse"].map((base) => `${base}@${e.setup}`)),
        ]),
      ].map((kind) => [kind, rank([...ecrits(kind), ...desNotes(kind)], [], removed(kind))])
    ) as Record<string, string[]>,
    // The conditions that call a trade off, which repeat far more than they
    // vary: the same handful comes back, and re-typing them invites three
    // wordings of one rule.
    cancelIfs: rank(ecrits("cancelIf"), [], removed("cancelIf")),
    // Written on examples and on trades alike, and hidden under the notes' own
    // kind, so a reason dropped there stays dropped here.
    invalidReasons: rank(
      [...examples, ...trades].flatMap((r) => parseTagArray(r.invalidReasons)),
      [],
      removed("invalidReason"),
    ),
  };
}
