/**
 * How far each imported trade went, read back out of its own notes.
 *
 * The trades brought over from the old journal carry a bracketed summary in
 * their post-trade notes — "[Account: LMI 100K | Result: win | TP: TP1 | …]" —
 * written by the tool they came from. Fifty-five of the eighty-eight say which
 * target was paid, which is the column this fills: without it the answer would
 * have to be typed again by hand, on trades closed months ago and no longer
 * remembered.
 *
 * Only ever fills what is empty. A level set on the trade page is someone
 * correcting what the note says, and a deploy must not overwrite it.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    const trades = await prisma.trade.findMany({
      where: { tpReached: null },
      select: { id: true, postTradeNotes: true },
    });

    let filled = 0;
    for (const trade of trades) {
      const found = /TP:\s*TP\s*([123])/i.exec(trade.postTradeNotes ?? "");
      if (!found) continue;

      await prisma.trade.update({
        where: { id: trade.id },
        data: { tpReached: Number(found[1]) },
      });
      filled++;
    }

    console.log(`Take profit atteint : ${filled} trade(s) rempli(s) depuis leurs notes.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
