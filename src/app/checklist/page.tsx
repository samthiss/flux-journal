import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { getEventRatings } from "@/lib/actions/eventRatings";
import { applyRatings, getEconomicEvents } from "@/lib/economicCalendar";
import { newsCurrencies } from "@/lib/contracts";
import ChecklistTabs from "@/components/ChecklistTabs";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  // Read here rather than in the browser: the feed sets no CORS headers, and
  // its own cache means one read serves every visit for the hour.
  const ownerId = await monJournal();
  const [calendar, ratings, rows] = await Promise.all([
    getEconomicEvents(),
    getEventRatings(),
    prisma.databentoSymbol.findMany({ where: { ownerId }, select: { symbol: true }, orderBy: { symbol: "asc" } }),
  ]);
  const pairs = rows.map((r) => r.symbol);
  const followed = new Set(pairs.flatMap(newsCurrencies));
  // The plan's blackout, as the backtest counts it: the source's own three
  // stars, before the journal's ratings are laid over them.
  const blackout = calendar.events
    .filter((e) => e.kind === "release" && e.impact === "high" && e.at && followed.has(e.currency))
    .map((e) => `${e.at}|${e.currency}|${e.title}`);

  return (
    <ChecklistTabs
      events={applyRatings(calendar.events, ratings)}
      calendarOk={calendar.ok}
      calendarSource={calendar.source}
      pairs={pairs}
      blackout={blackout}
    />
  );
}
