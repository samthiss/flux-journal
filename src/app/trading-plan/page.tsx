import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { getEconomicEvents } from "@/lib/economicCalendar";
import { COTATION_PERIMEE_MIN, ageMin, cotations, ligneLaPlusProche } from "@/lib/quotes";
import { newsCurrencies } from "@/lib/contracts";
import { chicagoInstant, sessionDate } from "@/lib/databento/clock";
import { loadPairPlans, pushPrefs } from "@/lib/planData";
import { dayKey, isNightBerlin } from "@/lib/tradingPlan";
import TradingPlan, { type DayNews } from "@/components/TradingPlan";

export const dynamic = "force-dynamic";

/** When the page is read, outside the render. */
const readNow = () => Date.now();

/**
 * The day's trading plan: each pair's order windows and prices, the day's
 * releases, the orders posed and filled, and the reminders on the phone.
 */
export default async function TradingPlanPage() {
  const ownerId = await monJournal();
  const now = readNow();
  const session = sessionDate(now);
  const day = dayKey(session);
  const [devices, recent] = await Promise.all([prisma.pushDevice.count(), prisma.pushSent.findMany({ orderBy: { sentAt: "desc" }, take: 5 })]);
  const [pairs, calendar, prefs, orders] = await Promise.all([
    loadPairPlans(ownerId),
    getEconomicEvents(),
    pushPrefs(),
    prisma.planOrder.findMany({
      // The day's orders, and a trade still on from an earlier one.
      where: { OR: [{ day }, { status: "filled" }] },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  /**
   * Où est le marché, pour chaque paire : le prix différé, son âge, et la
   * ligne la plus proche. Calculé ici parce que la page est servie par le
   * serveur et que le composant, lui, tourne dans le navigateur.
   */
  const quotes: Record<string, { price: number; age: number; niveau: number; ticks: number; perimee: boolean }> = {};
  for (const q of await cotations()) {
    const p = pairs.find((x) => x.symbol === q.symbol);
    if (!p) continue;
    const proche = ligneLaPlusProche(q.price, p.levels, p.tick);
    if (!proche) continue;
    const age = ageMin(q);
    quotes[q.symbol] = { price: q.price, age, niveau: proche.niveau, ticks: proche.ticks, perimee: age > COTATION_PERIMEE_MIN };
  }

  const followed = new Set(pairs.flatMap((p) => newsCurrencies(p.symbol)));
  const from = chicagoInstant(session.y, session.m, session.d, 0);
  const to = chicagoInstant(session.y, session.m, session.d, 23, 59);
  const news: DayNews[] = calendar.events
    .filter((e) => followed.has(e.currency) && e.at && new Date(e.at).getTime() >= from && new Date(e.at).getTime() <= to && !isNightBerlin(new Date(e.at).getTime()))
    .map((e) => ({ at: e.at, currency: e.currency, title: e.title, impact: e.impact, kind: e.kind }));

  return (
    <TradingPlan
      day={day}
      serverNow={now}
      pairs={pairs}
      news={news}
      newsOk={calendar.ok}
      quotes={quotes}
      prefs={{ exit: prefs.exit, news: prefs.news, pull: prefs.pull, bot: prefs.bot, approche: prefs.approche }}
      pushInfo={{ devices, recent: recent.map((r) => ({ key: r.key, at: r.sentAt.toISOString() })) }}
      orders={orders.map((o) => ({
        id: o.id,
        day: o.day,
        symbol: o.symbol,
        side: o.side,
        level: o.level,
        entry: o.entry,
        sl: o.sl,
        tp1: o.tp1,
        tp2: o.tp2,
        status: o.status,
        filledAt: o.filledAt?.toISOString() ?? null,
        outcome: o.outcome,
        pnl: o.pnl,
        tradeId: o.tradeId,
        cancelReason: o.cancelReason,
        botSentAt: o.botSentAt?.toISOString() ?? null,
        botCancelAt: o.botCancelAt?.toISOString() ?? null,
        botError: o.botError,
      }))}
    />
  );
}
