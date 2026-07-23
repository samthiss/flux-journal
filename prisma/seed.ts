import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const TRADES_SEED = [
  { date: "2026-07-21", symbol: "ES", side: "Long", size: 2, pnl: 125, setup: "Trend run", market: "Futures", rr: 1.5 },
  { date: "2026-07-21", symbol: "NQ", side: "Short", size: 1, pnl: -50, setup: "Backtest reverse", market: "Futures", rr: 1.2 },
  { date: "2026-07-19", symbol: "AAPL", side: "Long", size: 50, pnl: 87.5, setup: "Backtest reverse", market: "Stocks", rr: 1.8 },
  { date: "2026-07-18", symbol: "BTC", side: "Long", size: 0.5, pnl: 210, setup: "Trend run", market: "Crypto", rr: 2.1 },
  { date: "2026-07-17", symbol: "ES", side: "Short", size: 3, pnl: -300, setup: "Trend run", market: "Futures", rr: 0.8 },
];

const CHECKLIST_SEED = [
  {
    group: "Market Context",
    items: [
      "Check economic calendar for high-impact news",
      "Note yesterday's high/low and overnight range",
      "Identify overall market bias (risk-on / risk-off)",
    ],
  },
  {
    group: "Technical Setup",
    items: [
      "Mark key support / resistance levels",
      "Confirm trend direction on higher timeframe",
      "Wait for confirmation candle before entry",
    ],
  },
  {
    group: "Risk & Mindset",
    items: [
      "Define max loss for the day",
      "Set position size based on risk %",
      "Commit to no revenge trading",
    ],
  },
];

async function main() {
  // Demo trades are only useful for local development, never for a real
  // deployment — gated behind an explicit opt-in flag.
  if (process.env.SEED_DEMO_TRADES === "true") {
    await prisma.trade.createMany({
      data: TRADES_SEED.map((t) => ({
        ...t,
        date: new Date(t.date),
      })),
    });
  }

  // Checklist items are real app content (the pre-market routine), not demo
  // data, but this script must stay safe to re-run on every deploy/restart.
  const checklistCount = await prisma.checklistItem.count();
  if (checklistCount === 0) {
    let order = 0;
    for (const group of CHECKLIST_SEED) {
      for (const label of group.items) {
        await prisma.checklistItem.create({
          data: { group: group.group, label, order: order++ },
        });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
