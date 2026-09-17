import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { isValidPeriod, TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import TradesClient from "@/components/TradesClient";
import { parseTagArray } from "@/lib/tags";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { date: "asc" },
    // The two newer confirmation lists are read here rather than through the
    // shared select, which the dashboard and the report use as well and have
    // no use for them.
    select: {
      ...TRADE_FOR_STATS_SELECT,
      confirmationsBox: true,
      confirmationsReverse: true,
      invalidReasons: true,
      emotion: true,
      planFollowed: true,
    },
  });

  const stored = (await cookies()).get("dash-period")?.value;
  const initialPeriod = isValidPeriod(stored) ? stored : "week";

  /**
   * What each trade is annotated with, a column per vocabulary.
   *
   * Keyed by the column names the table declares, so a trade with nothing in
   * one of them leaves that cell empty rather than shifting the next word
   * under the wrong heading — which is what a single pile of chips did.
   */
  const details = Object.fromEntries(
    trades.map((t) => [
      t.id,
      // Lists rather than sentences: the table joins them to display, and the
      // column filters ask whether one word is among them.
      {
        emotion: t.emotion ? [t.emotion] : [],
        type: parseTagArray(t.tradeTypes),
        zone: t.zone ? [t.zone] : [],
        cc: parseTagArray(t.confirmations),
        box: parseTagArray(t.confirmationsBox),
        reverse: parseTagArray(t.confirmationsReverse),
        risk: parseTagArray(t.invalidReasons),
        plan: t.planFollowed === null ? [] : [t.planFollowed ? "Oui" : "Non"],
      },
    ])
  );

  return <TradesClient trades={trades} initialPeriod={initialPeriod} details={details} />;
}
