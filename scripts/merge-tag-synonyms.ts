/**
 * Merges the tags that say the same thing twice.
 *
 * The journal was written in German, read in English while it was translated,
 * and is kept in French — so the same trade type exists under two spellings:
 * "Against trend" beside "Contre la tendance". Two spellings of one word split
 * every count that word appears in, and no filter can put them back together:
 * a page of trades taken against the trend is half a page under either name.
 *
 * Two rules, both idempotent:
 *
 *  - a known synonym becomes its French word (the table below);
 *  - anything that differs only by case, accent or spacing from one of the
 *    words the app ships with becomes that word.
 *
 * Applied wherever a trade type is written — the note examples, the trades,
 * the trade ideas, and the remembered vocabulary — and a list that ends up
 * holding the same word twice keeps it once.
 *
 * A boot script rather than a migration, for the reason the other repairs here
 * are: production's own wordings are what has to be matched, and they are only
 * in production.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { TRADE_TYPES } from "../src/lib/tags";

/** Keyed by the normalised spelling, so "against trend" catches them all. */
const SYNONYMES: Record<string, string> = {
  "against trend": "Contre la tendance",
  "against the trend": "Contre la tendance",
  "gegen den trend": "Contre la tendance",
  "rebound on range": "Rebond sur range",
  "back into va": "Revient dans la VA / VWAP & Rebondit",
};

/** Lower case, no accents, no double spaces: what two spellings share. */
function normalise(mot: string) {
  return mot
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PAR_DEFAUT = new Map(TRADE_TYPES.map((mot) => [normalise(mot), mot as string]));

/** The word this one should be written as, or itself. */
function canonique(mot: string) {
  const cle = normalise(mot);
  return SYNONYMES[cle] ?? PAR_DEFAUT.get(cle) ?? mot;
}

function reecrire(raw: string | null): string | null {
  if (!raw) return raw;
  let mots: unknown;
  try {
    mots = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(mots)) return raw;
  const reecrits = [...new Set(mots.filter((m): m is string => typeof m === "string").map(canonique))];
  const suivant = JSON.stringify(reecrits);
  return suivant === raw ? raw : suivant;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    let changes = 0;

    for (const example of await prisma.noteExample.findMany({ select: { id: true, tradeTypes: true } })) {
      const suivant = reecrire(example.tradeTypes);
      if (suivant === example.tradeTypes) continue;
      await prisma.noteExample.update({ where: { id: example.id }, data: { tradeTypes: suivant } });
      changes++;
    }

    for (const trade of await prisma.trade.findMany({ select: { id: true, tradeTypes: true } })) {
      const suivant = reecrire(trade.tradeTypes);
      if (suivant === trade.tradeTypes) continue;
      await prisma.trade.update({ where: { id: trade.id }, data: { tradeTypes: suivant } });
      changes++;
    }

    for (const idea of await prisma.tradeIdea.findMany({ select: { id: true, tradeTypes: true } })) {
      const suivant = reecrire(idea.tradeTypes);
      if (suivant === idea.tradeTypes) continue;
      await prisma.tradeIdea.update({ where: { id: idea.id }, data: { tradeTypes: suivant } });
      changes++;
    }

    // The remembered vocabulary. A row whose word is a synonym is dropped
    // rather than rewritten: the French one is either already there or is
    // created here, and two rows for one word is the thing being undone.
    for (const option of await prisma.tagOption.findMany({ where: { kind: { startsWith: "tradeType" } } })) {
      const suivant = canonique(option.value);
      if (suivant === option.value) continue;
      await prisma.tagOption.delete({ where: { kind_value: { kind: option.kind, value: option.value } } });
      await prisma.tagOption.upsert({
        where: { kind_value: { kind: option.kind, value: suivant } },
        create: { kind: option.kind, value: suivant },
        update: {},
      });
      changes++;
    }

    // A word removed from the list under its English name stays removed under
    // its French one — the reader dropped the idea, not the spelling.
    for (const cache of await prisma.hiddenTagOption.findMany({ where: { kind: "tradeTypes" } })) {
      const suivant = canonique(cache.value);
      if (suivant === cache.value) continue;
      await prisma.hiddenTagOption.delete({ where: { kind_value: { kind: cache.kind, value: cache.value } } });
      await prisma.hiddenTagOption.upsert({
        where: { kind_value: { kind: cache.kind, value: suivant } },
        create: { kind: cache.kind, value: suivant },
        update: {},
      });
      changes++;
    }

    if (changes) console.log(`merge-tag-synonyms: ${changes} écriture(s) ramenée(s) à un seul mot.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // A failed merge must not keep the journal from starting.
  console.error("merge-tag-synonyms: échec", err);
});
