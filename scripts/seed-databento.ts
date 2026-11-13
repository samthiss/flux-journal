/**
 * The Databento reports, put into the owner's journal at start.
 *
 * The backtest is run on the trader's machine (scripts/databento-analyse.ts),
 * where the year of bars is; what it found travels with the code in
 * prisma/databento-results.json and is loaded here, since the production
 * database cannot be written from anywhere else.
 *
 * A report already in place is left alone — and with it the configuration
 * chosen in the page — unless the file holds a newer run of the analysis. A
 * pair the file no longer holds is removed.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

const FILE = path.join(process.cwd(), "prisma", "databento-results.json");
const OWNER = "owner";

type Entry = { symbol: string; zones: number[]; result: { ranAt: number } };

async function main() {
  if (!existsSync(FILE)) return;
  const entries = JSON.parse(readFileSync(FILE, "utf8")) as Entry[];
  let written = 0;
  for (const e of entries) {
    const current = await prisma.databentoSymbol.findUnique({ where: { ownerId_symbol: { ownerId: OWNER, symbol: e.symbol } } });
    let ranAt = 0;
    try {
      ranAt = current?.result ? (JSON.parse(current.result) as { ranAt: number }).ranAt : 0;
    } catch {
      ranAt = 0;
    }
    if (current && ranAt >= e.result.ranAt) continue;
    const data = { zones: JSON.stringify(e.zones), result: JSON.stringify(e.result), chosenKey: null };
    await prisma.databentoSymbol.upsert({
      where: { ownerId_symbol: { ownerId: OWNER, symbol: e.symbol } },
      create: { ownerId: OWNER, symbol: e.symbol, ...data },
      update: data,
    });
    written++;
  }
  // A pair the analysis no longer covers goes, with its report.
  const gone = await prisma.databentoSymbol.deleteMany({ where: { ownerId: OWNER, symbol: { notIn: entries.map((e) => e.symbol) } } });
  console.log(`Databento : ${written} rapport(s) chargé(s) sur ${entries.length}, ${gone.count} retiré(s).`);
}

main()
  .catch((e) => {
    // A report that does not load must not keep the journal from starting.
    console.error("Databento : chargement des rapports impossible.", e);
  })
  .finally(() => prisma.$disconnect());
