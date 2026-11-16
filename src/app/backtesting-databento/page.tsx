import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import DatabentoClient from "@/components/DatabentoClient";
import { getHighImpactBetween } from "@/lib/economicCalendar";
import { newsCurrencies } from "@/lib/contracts";

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

export default async function BacktestingDatabentoPage() {
  const ownerId = await monJournal();
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId }, orderBy: { symbol: "asc" } });
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
        }))}
        news={news}
        now={now}
        berlinShift={berlinShift}
      />
    </div>
  );
}
