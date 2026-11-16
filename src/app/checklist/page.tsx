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
    prisma.databentoSymbol.findMany({ where: { ownerId }, select: { symbol: true, result: true }, orderBy: { symbol: "asc" } }),
  ]);
  const pairs = rows.map((r) => r.symbol);
  const followed = new Set(pairs.flatMap(newsCurrencies));
  // The plan's blackout, as the backtest counts it: the source's own three
  // stars, before the journal's ratings are laid over them.
  const blackout = calendar.events
    .filter((e) => e.kind === "release" && e.impact === "high" && e.at && followed.has(e.currency))
    .map((e) => `${e.at}|${e.currency}|${e.title}`);

  // Each pair's order hours in Chicago time, as its backtest was run: the
  // calendar marks the hours a pair is not to be traded.
  type Saved = { rules?: { hours?: [number, number] | null; excludeHours?: number[] } };
  const sessions = rows.flatMap((r) => {
    const rules = r.result ? (JSON.parse(r.result) as Saved).rules : undefined;
    return rules?.hours ? [{ symbol: r.symbol, hours: rules.hours, exclude: rules.excludeHours ?? [] }] : [];
  });

  return (
    <ChecklistTabs
      events={applyRatings(calendar.events, ratings)}
      calendarOk={calendar.ok}
      calendarSource={calendar.source}
      pairs={pairs}
      blackout={blackout}
      sessions={sessions}
    />
  );
}
