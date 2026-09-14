/**
 * What the agent is allowed to look at, and how it reads it.
 *
 * Every answer the agent gives has to come from here: these functions are its
 * only contact with the journal, and they read the live rows rather than any
 * copy. That is deliberate — an index would be a second version of the notes,
 * free to fall behind the first, and a rule answered from a stale copy is
 * worse than no answer.
 *
 * Everything returns text rather than objects. The reader is a language model,
 * and a rule reads as what it is — a line, under a heading, inside a strategy —
 * only when the shape is spelled out. JSON handed over raw loses exactly the
 * nesting the question turns on: "my confirmations FOR Trend run".
 */

import { prisma } from "@/lib/prisma";

/**
 * Words compared without their accents or case.
 *
 * The journal is written across two languages and several sittings: the same
 * note says "Parametres" and "paramètre", "d´interet" and "intérêt". Matching
 * on the letters alone is what makes a search for "paramètres" find them.
 */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The words of a query, minus the ones that match everything. */
const STOP = new Set([
  // Grammar.
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "a", "au", "aux",
  "pour", "par", "dans", "sur", "je", "mes", "mon", "ma", "quoi", "quel", "quelle",
  "quels", "quelles", "est", "ce", "que", "qui", "combien", "c", "d", "l", "son",
  "ses", "avec", "sont", "quand", "comment", "pourquoi",
  // Asking, not subject: every question contains some of these, and they were
  // pulling unrelated passages up on the strength of the phrasing alone.
  "veux", "voir", "faire", "savoir", "dis", "dire", "rappelle", "montre",
  "explique", "donne", "peux", "dois", "regle", "regles",
]);

function terms(query: string): string[] {
  return [...new Set(fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}

/**
 * The two-word sequences of the question, kept whole.
 *
 * Counting words alone ranked the wrong passages first: asked how many box
 * clusters there should be per hour, three blocks mentioning box, cluster and
 * hour separately outranked the one rule that says "1-3 cluster par heure",
 * because it happens not to contain the word "box". A pair of adjacent words
 * survives that — "par heure" is in the rule and in almost nothing else.
 */
function pairs(query: string): string[] {
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const carries = (word: string) => word.length > 2 && !STOP.has(word);

  return [
    ...new Set(
      words
        .slice(0, -1)
        .map((word, i) => [word, words[i + 1]] as const)
        // At least one of the two has to mean something. Built from the raw
        // sentence, the pairs included "sur les" and "est ma", which are worth
        // four points each and were dragging unrelated passages above the
        // floor. Kept raw otherwise, because the signal that works is a content
        // word next to its preposition: "par heure" finds the one rule that
        // says how many clusters an hour, "heure" alone does not.
        .filter(([first, second]) => carries(first) || carries(second))
        .map(([first, second]) => `${first} ${second}`),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Rendering a note's own shapes
// ---------------------------------------------------------------------------

type RuleItem = { title?: string; details?: string[] };

/**
 * One block, as text.
 *
 * The five kinds a note holds are stored in five different shapes — a list of
 * strings, a list of headed lists, a bare line — and the type name alone says
 * what the block is for, so it is kept as a heading.
 */
function renderBlock(type: string, content: string): string {
  const raw = (content ?? "").trim();
  if (!raw) return "";

  const label =
    type === "retenir" ? "À retenir" : type === "regles" ? "Règles" : type === "objectif" ? "Objectif" : type === "headings" ? "Titre" : type;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A bare line, which is how objectifs and section labels are stored.
    return `${label} : ${raw}`;
  }

  const lines: string[] = [];

  const pushItems = (items: RuleItem[]) => {
    for (const item of items) {
      if (item.title) lines.push(`  • ${item.title.replace(/\s+/g, " ").trim()}`);
      for (const detail of item.details ?? []) lines.push(`      - ${detail.replace(/\s+/g, " ").trim()}`);
    }
  };

  if (Array.isArray(parsed)) {
    if (parsed.every((v) => typeof v === "string")) {
      for (const line of parsed as string[]) lines.push(`  • ${line.replace(/\s+/g, " ").trim()}`);
    } else {
      pushItems(parsed as RuleItem[]);
    }
  } else if (parsed && typeof parsed === "object") {
    const object = parsed as { label?: string; items?: RuleItem[] };
    if (object.label) lines.push(`  ${object.label}`);
    pushItems(object.items ?? []);
  }

  return lines.length ? `${label} :\n${lines.join("\n")}` : "";
}

/** "Parametres > Box cluster", the way a note is named to the reader. */
async function paths(): Promise<Map<string, string>> {
  const notes = await prisma.note.findMany({ select: { id: true, title: true, parentId: true } });
  const byId = new Map(notes.map((n) => [n.id, n]));

  const walk = (id: string): string => {
    const note = byId.get(id);
    if (!note) return "";
    return note.parentId ? `${walk(note.parentId)} > ${note.title}` : note.title;
  };

  return new Map(notes.map((n) => [n.id, walk(n.id)]));
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export type Hit = { chemin: string; ou: string; extrait: string };

/**
 * Every passage of the notes matching a set of words.
 *
 * Titles, category names, blocks, examples and image captions alike: the
 * answer to a question about box clusters turned out to live in a note called
 * "Trend run", so searching only where the subject is named would miss it.
 */
export async function chercherNotes(question: string, limite = 14): Promise<Hit[]> {
  const words = terms(question);
  if (words.length === 0) return [];
  const expressions = pairs(question);

  const chemin = await paths();

  /**
   * How well a passage answers the question.
   *
   * A word found is worth one point; the same word found repeatedly is worth a
   * little more, up to a limit, so a rule that dwells on the subject beats one
   * that mentions it in passing. A two-word expression is worth four, which is
   * what puts the passage that speaks the question's own language on top.
   */
  const score = (text: string) => {
    const folded = fold(text);
    let points = 0;
    for (const word of words) {
      // Matched from the start of a word only: as a bare substring, "sur"
      // matched "mesure" and dragged in passages about nothing.
      const found = folded.match(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"))?.length ?? 0;
      if (found) points += 1 + Math.min(found - 1, 2) * 0.5;
    }
    for (const expression of expressions) if (folded.includes(expression)) points += 4;

    // Damped by length. The two longest blocks in the journal mention most
    // subjects somewhere and were winning every search on volume alone; a rule
    // of one line that answers the question exactly should not lose to them.
    return points / (1 + folded.length / 3000);
  };
  const hits: (Hit & { points: number })[] = [];

  const [notes, cats, examples, blocks, images] = await Promise.all([
    prisma.note.findMany({ select: { id: true, title: true } }),
    prisma.noteCategory.findMany({ select: { name: true, noteId: true } }),
    prisma.noteExample.findMany({
      select: { id: true, title: true, caption: true, tags: true, noteId: true, categoryId: true },
    }),
    prisma.noteBlock.findMany({ select: { type: true, content: true, noteId: true, categoryId: true, exampleId: true } }),
    prisma.noteExampleImage.findMany({ select: { caption: true, exampleId: true } }),
  ]);

  const exampleNote = new Map(examples.map((e) => [e.id, e.noteId]));

  for (const note of notes) {
    const points = score(note.title);
    if (points) hits.push({ points, chemin: chemin.get(note.id) ?? note.title, ou: "titre de note", extrait: note.title });
  }

  for (const cat of cats) {
    const points = score(cat.name);
    if (points) {
      hits.push({
        points,
        chemin: `${chemin.get(cat.noteId) ?? ""} › ${cat.name}`,
        ou: "catégorie",
        extrait: cat.name,
      });
    }
  }

  for (const block of blocks) {
    const texte = renderBlock(block.type, block.content ?? "");
    // Scored on what was written, not on how it is rendered: the renderer puts
    // the word "Règles" atop every rules block, so scoring the rendering made
    // every question containing "règle" match the whole journal.
    const points = score(block.content ?? "");
    if (!points) continue;
    const noteId = block.noteId ?? (block.exampleId ? exampleNote.get(block.exampleId) : null) ?? null;
    hits.push({
      points,
      chemin: noteId ? (chemin.get(noteId) ?? "") : "(bloc isolé)",
      ou: `bloc « ${block.type} »`,
      extrait: texte.slice(0, 700),
    });
  }

  for (const example of examples) {
    const texte = [example.title, example.caption, example.tags].filter(Boolean).join(" — ");
    const points = score(texte);
    if (!points) continue;
    hits.push({
      points,
      chemin: chemin.get(example.noteId) ?? "",
      ou: "exemple",
      extrait: texte.slice(0, 500),
    });
  }

  for (const image of images) {
    if (!image.caption) continue;
    const points = score(image.caption);
    if (!points) continue;
    const noteId = exampleNote.get(image.exampleId);
    hits.push({
      points,
      chemin: noteId ? (chemin.get(noteId) ?? "") : "",
      ou: "légende d'image",
      extrait: image.caption.slice(0, 300),
    });
  }

  const classés = hits.sort((a, b) => b.points - a.points || a.chemin.localeCompare(b.chemin));
  if (classés.length === 0) return [];

  /**
   * Weak matches are dropped rather than returned.
   *
   * A search for something the journal never mentions still finds passages
   * sharing a word or two, and handing those over invites an answer built out
   * of whatever was nearest. Nothing returned is the honest result, and the
   * one the agent is told to report as "ce n'est pas écrit".
   */
  const meilleur = classés[0].points;
  return classés
    .filter((hit) => hit.points >= 2 && hit.points >= meilleur * 0.35)
    .slice(0, limite)
    .map(({ chemin: c, ou, extrait }) => ({ chemin: c, ou, extrait }));
}

/**
 * One note, whole: its blocks, its categories, its examples and their captions.
 *
 * Matched on the last part of the path and without accents, because the agent
 * will have read a path out of a search result and a human will type "box
 * cluster" — both have to land on the same note.
 */
export async function lireNote(chemin: string): Promise<string> {
  const wanted = fold(chemin.split(">").pop()?.trim() ?? chemin);
  const all = await paths();

  const notes = await prisma.note.findMany({ select: { id: true, title: true } });
  const note =
    notes.find((n) => fold(n.title) === wanted) ??
    notes.find((n) => fold(n.title).includes(wanted)) ??
    notes.find((n) => fold(all.get(n.id) ?? "").includes(fold(chemin)));

  if (!note) return `Aucune note ne correspond à « ${chemin} ».`;

  const out: string[] = [`# ${all.get(note.id)}`];
  // Counted as we go: a note holding nothing but screenshots has to say that
  // out loud, or its silence reads as "the rule is not written anywhere" when
  // it is written on a chart. Headings and category names do not count as
  // words said — only blocks and captions do.
  let images = 0;
  let prose = 0;

  const blocks = await prisma.noteBlock.findMany({
    where: { noteId: note.id },
    orderBy: { order: "asc" },
    select: { type: true, content: true },
  });
  for (const block of blocks) {
    const texte = renderBlock(block.type, block.content ?? "");
    if (texte) {
      out.push(texte);
      prose += texte.length;
    }
  }

  const cats = await prisma.noteCategory.findMany({
    where: { noteId: note.id },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  for (const cat of cats) {
    out.push(`\n## ${cat.name}`);

    const catBlocks = await prisma.noteBlock.findMany({
      where: { categoryId: cat.id },
      orderBy: { order: "asc" },
      select: { type: true, content: true },
    });
    for (const block of catBlocks) {
      const texte = renderBlock(block.type, block.content ?? "");
      if (texte) {
        out.push(texte);
        prose += texte.length;
      }
    }

    const examples = await prisma.noteExample.findMany({
      where: { categoryId: cat.id },
      orderBy: { order: "asc" },
      select: { id: true, title: true, caption: true, tags: true, validity: true },
    });
    for (const example of examples) {
      const shots = await prisma.noteExampleImage.findMany({
        where: { exampleId: example.id },
        select: { caption: true },
      });
      images += shots.length;
      const legendes = shots.map((i) => i.caption).filter(Boolean);
      prose += (example.caption ?? "").length + legendes.join("").length;
      out.push(
        [
          `  Exemple : ${example.title || "(sans titre)"}`,
          example.caption ? `    ${example.caption.replace(/\s+/g, " ")}` : "",
          example.tags ? `    tags : ${example.tags}` : "",
          example.validity ? `    validité : ${example.validity}` : "",
          `    ${shots.length} image(s)${legendes.length ? ` — ${legendes.join(" · ")}` : " sans légende"}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  if (prose < 40) {
    out.push(
      images > 0
        ? `\n(Cette note ne contient aucun texte : tout est dans ses ${images} image(s). Utilise l'outil images pour les regarder.)`
        : "\n(Cette note est vide.)",
    );
  }

  return out.join("\n");
}

/**
 * The images of a note, with what is known about each.
 *
 * Listed rather than sent: an image costs more than a page of text to read, so
 * the agent picks from this list and asks for the one it needs.
 */
export async function imagesDe(chemin: string): Promise<{ id: string; url: string; legende: string; exemple: string }[]> {
  const wanted = fold(chemin.split(">").pop()?.trim() ?? chemin);
  const notes = await prisma.note.findMany({ select: { id: true, title: true } });
  const note = notes.find((n) => fold(n.title) === wanted) ?? notes.find((n) => fold(n.title).includes(wanted));
  if (!note) return [];

  const examples = await prisma.noteExample.findMany({
    where: { noteId: note.id },
    select: { id: true, title: true },
  });

  const images = await prisma.noteExampleImage.findMany({
    where: { exampleId: { in: examples.map((e) => e.id) } },
    orderBy: { order: "asc" },
    select: { id: true, url: true, caption: true, exampleId: true },
  });

  const titles = new Map(examples.map((e) => [e.id, e.title ?? ""]));
  return images.map((image) => ({
    id: image.id,
    url: image.url,
    legende: image.caption ?? "",
    exemple: titles.get(image.exampleId) ?? "",
  }));
}

export type TradeFilters = {
  symbole?: string;
  setup?: string;
  type?: string;
  zone?: string;
  confirmation?: string;
  /** 1, 2 or 3 — trades the market carried at least that far. */
  tpAtteint?: number;
  depuis?: string;
  jusqua?: string;
};

/** The trades matching a set of filters, counted and summed up. */
export async function interrogerTrades(filtres: TradeFilters): Promise<string> {
  const where: Record<string, unknown> = {};
  if (filtres.symbole) where.symbol = filtres.symbole;
  if (filtres.setup) where.setup = filtres.setup;
  if (filtres.tpAtteint) where.tpReached = { gte: filtres.tpAtteint };
  if (filtres.depuis || filtres.jusqua) {
    where.date = {
      ...(filtres.depuis ? { gte: new Date(`${filtres.depuis}T00:00:00`) } : {}),
      ...(filtres.jusqua ? { lte: new Date(`${filtres.jusqua}T23:59:59`) } : {}),
    };
  }

  let trades = await prisma.trade.findMany({
    where,
    orderBy: { date: "asc" },
    select: {
      date: true, symbol: true, setup: true, side: true, pnl: true, rr: true,
      tpReached: true, tradeTypes: true, zone: true, confirmations: true,
    },
  });

  // The three vocabularies are JSON columns, so they are filtered here rather
  // than in the query.
  const has = (raw: string | null, value: string) => fold(raw ?? "").includes(fold(value));
  if (filtres.type) trades = trades.filter((t) => has(t.tradeTypes, filtres.type!));
  if (filtres.zone) trades = trades.filter((t) => has(t.zone, filtres.zone!));
  if (filtres.confirmation) trades = trades.filter((t) => has(t.confirmations, filtres.confirmation!));

  if (trades.length === 0) return "Aucun trade ne correspond à ces filtres.";

  const wins = trades.filter((t) => t.pnl > 0);
  const pnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const withRR = trades.filter((t) => t.rr != null);
  const rr = withRR.length ? withRR.reduce((sum, t) => sum + (t.rr ?? 0), 0) / withRR.length : null;
  const tp = (level: number) => trades.filter((t) => (t.tpReached ?? 0) >= level).length;

  return [
    `${trades.length} trade(s) du ${trades[0].date.toISOString().slice(0, 10)} au ${trades[trades.length - 1].date.toISOString().slice(0, 10)}`,
    `win rate : ${Math.round((wins.length / trades.length) * 100)} % (${wins.length}G / ${trades.length - wins.length}P)`,
    `P&L cumulé : ${pnl.toFixed(2)}`,
    rr != null ? `R:R moyen : ${rr.toFixed(2)} sur ${withRR.length} trade(s) qui l'ont renseigné` : "R:R : non renseigné",
    `take profit : TP1+ ${tp(1)} · TP2+ ${tp(2)} · TP3 ${tp(3)} · aucun ${trades.filter((t) => t.tpReached == null).length}`,
  ].join("\n");
}

/** What the volume alert actually fired, by hour and by day. */
export async function lireVolumeAlert(marche?: string): Promise<string> {
  const rows = await prisma.volumeAlertHour.findMany({
    where: marche ? { market: marche } : {},
    orderBy: [{ day: "desc" }, { hour: "asc" }],
    take: 200,
  });
  if (rows.length === 0) return "Aucune heure enregistrée dans Volume Alert.";

  return rows
    .map((row) => {
      const values: number[] = JSON.parse(row.values || "[]");
      return `${row.day} ${row.hour}h-${row.hour + 1}h · ${row.market} · seuil ${row.threshold} · ${values.length} alerte(s)${
        values.length ? ` : ${values.join(", ")}` : ""
      }`;
    })
    .join("\n");
}

/** The checklist, group by group. */
export async function lireChecklist(): Promise<string> {
  const items = await prisma.checklistItem.findMany({ orderBy: { order: "asc" } });
  const groups = new Map<string, string[]>();
  for (const item of items) (groups.get(item.group) ?? groups.set(item.group, []).get(item.group)!).push(item.label);

  return [...groups.entries()].map(([group, labels]) => `${group}\n${labels.map((l) => `  • ${l}`).join("\n")}`).join("\n\n");
}
