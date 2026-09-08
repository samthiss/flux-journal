/**
 * The ratings transcribed from investing.com's September calendar.
 *
 * Only the rows where the two calendars disagree: everything else this journal
 * shows already matches. The disagreements are all of one shape — a release
 * with no consensus figure to be surprised by, which the calendar source
 * therefore files as unimportant. A final PMI confirms a flash reading, and an
 * ISM prices sub-index is not forecast at all; both move the open regardless.
 *
 * Ratings set by hand from the card win over these: this script only ever
 * rewrites its own rows, so a deploy cannot undo a click.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

const FROM_INVESTING: { currency: string; title: string; impact: string }[] = [
  { currency: "USD", title: "S&P Global Manufacturing PMI Final", impact: "medium" },
  { currency: "USD", title: "S&P Global Services PMI Final", impact: "medium" },
  { currency: "USD", title: "ISM Manufacturing Prices", impact: "medium" },
  { currency: "USD", title: "ISM Services Prices", impact: "medium" },
];

async function main() {
  for (const rating of FROM_INVESTING) {
    const existing = await prisma.eventRating.findUnique({
      where: { currency_title: { currency: rating.currency, title: rating.title } },
    });
    if (existing && existing.source === "moi") continue;

    await prisma.eventRating.upsert({
      where: { currency_title: { currency: rating.currency, title: rating.title } },
      create: { ...rating, source: "investing" },
      update: { impact: rating.impact, source: "investing" },
    });
  }
  console.log(`Notes investing.com : ${FROM_INVESTING.length} lignes vérifiées.`);
}

main().finally(() => prisma.$disconnect());
