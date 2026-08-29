/**
 * Puts the French version of a note block in place of a German one.
 *
 * The notes tree was translated once, but only in a local copy of the journal —
 * production kept the German it was imported with, which is why the bullet list
 * under "Backtest reverse" still opens with "In welcher Marktphase bist du?".
 * The French text lives in `french-note-blocks.json`, exported from that local
 * copy, and this migration carries it over at boot.
 *
 * A block is only rewritten when what is stored still reads as German. That
 * guard is the whole safety of this script: it replaces a block's entire
 * content, so a block that has already been translated, or that the author has
 * since rewritten in French, must be left alone. Blocks are addressed by id, so
 * a production database that numbered them differently is simply not touched.
 *
 * What it cannot know is whether a German block gained a bullet in production
 * after the local copy was taken — that bullet would be replaced along with the
 * German around it. Nothing in the row records when it was last edited, so the
 * choice is between translating and leaving it in German.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Entry = { id: string; type: string; fr: string };

/**
 * German function words and nouns that do not occur in this journal's French.
 *
 * Deliberately not in the list: "du", which is a French word too, and the bare
 * umlaut. The author writes German trading vocabulary inside French sentences —
 * wändebereich, stunden cluster — and a block of theirs carrying one of those
 * must not be mistaken for an untranslated one and overwritten.
 */
const GERMAN =
  /ß|\b(muss|müssen|nicht|außerhalb|welcher|welche|bist|dein|deine|deinem|sich|beim|wenn|dann|werden|wird|kann|sollte|Kerze|Kerzen|Marktphase|Einstieg|Ausstieg|Volumen|Wohlfühloase)\b/;

async function main() {
  const entries: Entry[] = JSON.parse(
    readFileSync(join(import.meta.dirname, "french-note-blocks.json"), "utf8")
  );

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    let translated = 0;
    for (const entry of entries) {
      const block = await prisma.noteBlock.findUnique({
        where: { id: entry.id },
        select: { content: true },
      });
      if (!block?.content) continue;
      if (block.content === entry.fr) continue;
      if (!GERMAN.test(block.content)) continue;

      await prisma.noteBlock.update({ where: { id: entry.id }, data: { content: entry.fr } });
      translated++;
    }

    // Silent in the steady state: this runs on every deploy.
    if (translated) console.log(`translate-german-note-blocks: ${translated} bloc(s) traduit(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // As for the trade notes: a failure here leaves the German in place, which is
  // the state before this script existed, and must not stop the journal booting.
  console.error("translate-german-note-blocks: échec", err);
});
