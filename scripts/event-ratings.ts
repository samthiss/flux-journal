/**
 * investing.com's September calendar for the United States, transcribed.
 *
 * That capture was already filtered to three stars, so every line in it is the
 * top rating — which is the whole content of the transcription: these titles
 * are important, the rest of the month is not. The list is worth keeping even
 * though half of it agrees with the calendar source already, because the ones
 * that disagree are the point, and a title moving between ratings later should
 * land back here rather than silently drift.
 *
 * Only the American releases: that is what the capture covered. Every other
 * currency keeps the source's own rating until a capture or a click says
 * otherwise.
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

/** Three stars at investing.com, which is the only rating that capture carried. */
const FROM_INVESTING: { currency: string; title: string; impact: string }[] = [
  { currency: "USD", title: "ISM Manufacturing PMI", impact: "high" },
  { currency: "USD", title: "ISM Manufacturing Prices", impact: "high" },
  // investing : S&P Global Manufacturing PMI (Aug)
  { currency: "USD", title: "S&P Global Manufacturing PMI Final", impact: "high" },
  // investing : S&P Global Manufacturing PMI (Sep) (P)
  { currency: "USD", title: "S&P Global Manufacturing PMI Flash", impact: "high" },
  // investing : JOLTS Job Openings
  { currency: "USD", title: "JOLTs Job Openings", impact: "high" },
  // investing : ADP Nonfarm Employment Change
  { currency: "USD", title: "ADP Employment Change", impact: "high" },
  // investing : Crude Oil Inventories
  { currency: "USD", title: "EIA Crude Oil Stocks Change", impact: "high" },
  { currency: "USD", title: "Initial Jobless Claims", impact: "high" },
  // investing : ISM Non-Manufacturing PMI
  { currency: "USD", title: "ISM Services PMI", impact: "high" },
  // investing : ISM Non-Manufacturing Prices
  { currency: "USD", title: "ISM Services Prices", impact: "high" },
  // investing : S&P Global Services PMI (Aug)
  { currency: "USD", title: "S&P Global Services PMI Final", impact: "high" },
  // investing : S&P Global Services PMI (Sep) (P)
  { currency: "USD", title: "S&P Global Services PMI Flash", impact: "high" },
  { currency: "USD", title: "Average Hourly Earnings MoM", impact: "high" },
  // investing : Nonfarm Payrolls
  { currency: "USD", title: "Non Farm Payrolls", impact: "high" },
  { currency: "USD", title: "Unemployment Rate", impact: "high" },
  { currency: "USD", title: "10-Year Note Auction", impact: "high" },
  { currency: "USD", title: "30-Year Bond Auction", impact: "high" },
  // investing : PPI (MoM)
  { currency: "USD", title: "PPI MoM", impact: "high" },
  { currency: "USD", title: "Existing Home Sales", impact: "high" },
  // investing : CPI (MoM)
  { currency: "USD", title: "Inflation Rate MoM", impact: "high" },
  // investing : CPI (YoY)
  { currency: "USD", title: "Inflation Rate YoY", impact: "high" },
  // investing : Core CPI (MoM)
  { currency: "USD", title: "Core Inflation Rate MoM", impact: "high" },
  // investing : Retail Sales (MoM)
  { currency: "USD", title: "Retail Sales MoM", impact: "high" },
  // investing : Core Retail Sales (MoM)
  { currency: "USD", title: "Retail Sales Ex Autos MoM", impact: "high" },
  { currency: "USD", title: "Fed Interest Rate Decision", impact: "high" },
  { currency: "USD", title: "FOMC Economic Projections", impact: "high" },
  // investing : FOMC Press Conference
  { currency: "USD", title: "Fed Press Conference", impact: "high" },
  { currency: "USD", title: "Philadelphia Fed Manufacturing Index", impact: "high" },
  { currency: "USD", title: "New Home Sales", impact: "high" },
  // investing : Durable Goods Orders (MoM)
  { currency: "USD", title: "Durable Goods Orders MoM", impact: "high" },
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
