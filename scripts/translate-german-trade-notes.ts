/**
 * Replaces the German passages of the trade journal with their French
 * translation.
 *
 * Forty-three trades were imported carrying their pre-trade analysis in German,
 * and twenty-one distinct passages of coach feedback sit in the post-trade
 * notes, after the bracketed metadata. The text is journal content, not
 * application strings, so it lives in the database and cannot be fixed by
 * editing a file — hence this one-off migration, run at boot alongside the
 * image-dimension backfill.
 *
 * Each entry replaces a passage wherever it occurs rather than overwriting the
 * whole field. A post-trade note is metadata, then feedback, sometimes then a
 * list of chart links, and often a French line the author wrote themselves:
 * only the German passage may change. Replacing a passage rather than matching
 * a row also means the migration does not depend on trade ids — the ids in a
 * local copy need not be production's — and makes it idempotent for free, since
 * a passage already in French no longer matches anything.
 *
 * Notes the author wrote in French with German trading vocabulary in them
 * (wändebereich, stunden cluster) are deliberately absent from the data file:
 * that vocabulary is theirs, and those notes are left exactly as they are.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Entry = { field: "preTradeNotes" | "postTradeNotes"; de: string; fr: string };

async function main() {
  // Longest passage first. One note opens with "Schöner Einstieg" and carries
  // on for three more sentences; applied in file order, the two-word passage
  // that appears alone elsewhere would match inside it and translate the
  // opening while leaving the rest in German.
  const entries: Entry[] = (
    JSON.parse(readFileSync(join(import.meta.dirname, "german-trade-notes.json"), "utf8")) as Entry[]
  ).sort((a, b) => b.de.length - a.de.length);

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    const trades = await prisma.trade.findMany({
      select: { id: true, preTradeNotes: true, postTradeNotes: true },
    });

    let changed = 0;
    let passages = 0;
    for (const trade of trades) {
      const next = { preTradeNotes: trade.preTradeNotes, postTradeNotes: trade.postTradeNotes };
      for (const entry of entries) {
        const current = next[entry.field];
        if (!current || !current.includes(entry.de)) continue;
        next[entry.field] = current.split(entry.de).join(entry.fr);
        passages++;
      }
      if (next.preTradeNotes === trade.preTradeNotes && next.postTradeNotes === trade.postTradeNotes) continue;
      await prisma.trade.update({ where: { id: trade.id }, data: next });
      changed++;
    }

    // Silent once the work is done: every boot after the first changes nothing,
    // and this runs on every deploy.
    if (changed) {
      console.log(`translate-german-trade-notes: ${passages} passage(s) traduit(s) sur ${changed} trade(s).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // A failed translation must not keep the journal from starting: the notes
  // stay in German, which is exactly the state before this script existed.
  console.error("translate-german-trade-notes: échec", err);
});
