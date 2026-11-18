import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import DatabentoClient from "@/components/DatabentoClient";
import { getHighImpactBetween } from "@/lib/economicCalendar";
import { newsCurrencies } from "@/lib/contracts";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TrendResults } from "@/components/DatabentoClient";

export const dynamic = "force-dynamic";

/** The releases that block an order over the coming week, and the moment they were read. */
async function weekNews(currencies: string[]) {
  const now = Date.now();
  const news = currencies.length ? await getHighImpactBetween(new Date(now - 3600000), new Date(now + 7 * 864e5), currencies) : [];
  // Berlin's hours ahead of Chicago's today: 7 most of the year, 6 for the few weeks the two change their clocks apart.
  const hourIn = (timeZone: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  const berlinShift = (hourIn("Europe/Berlin") - hourIn("America/Chicago") + 24) % 24;
  return { news, now, berlinShift };
}

/** The "Trade with Trend" backtest, run on the trader's machine (scripts/trend-analyse.ts) and shipped with the code. */
function trendResults(): TrendResults | null {
  const file = path.join(process.cwd(), "prisma", "trend-results.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as TrendResults;
  } catch {
    return null;
  }
}

export default async function BacktestingDatabentoPage() {
  const ownerId = await monJournal();
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId }, orderBy: { symbol: "asc" } });
  const reviewed = (await prisma.backtestReview.findMany({ where: { ownerId }, select: { key: true } })).map((r) => r.key);
  // Every currency the pairs follow: each pair's own and the dollar.
  const { news, now, berlinShift } = await weekNews([...new Set(rows.flatMap((r) => newsCurrencies(r.symbol)))]);

  return (
    <div>
      <DatabentoClient
        initial={rows.map((r) => ({
          symbol: r.symbol,
          zones: JSON.parse(r.zones) as number[],
          result: r.result,
          chosenKey: r.chosenKey,
          disabled: (() => {
            try {
              return JSON.parse(r.disabledZones) as number[];
            } catch {
              return [];
            }
          })(),
        }))}
        news={news}
        now={now}
        berlinShift={berlinShift}
        trend={trendResults()}
        trendOn={rows.filter((r) => r.trendOn).map((r) => r.symbol)}
        reviewed={reviewed}
      />
    </div>
  );
}
