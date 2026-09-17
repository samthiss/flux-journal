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
    select: { ...TRADE_FOR_STATS_SELECT, confirmationsBox: true, confirmationsReverse: true },
  });

  const stored = (await cookies()).get("dash-period")?.value;
  const initialPeriod = isValidPeriod(stored) ? stored : "week";

  /**
   * What each trade is annotated with, in one list per trade.
   *
   * Gathered here rather than in the table, so the table shows words without
   * knowing which column each came from: the setup, the zone, the type and the
   * three confirmation lists all read as the same kind of thing in a row.
   */
  const tags = Object.fromEntries(
    trades.map((t) => [
      t.id,
      [
        ...parseTagArray(t.tradeTypes),
        ...(t.zone ? [t.zone] : []),
        ...parseTagArray(t.confirmations),
        ...parseTagArray(t.confirmationsBox),
        ...parseTagArray(t.confirmationsReverse),
      ],
    ])
  );

  return <TradesClient trades={trades} initialPeriod={initialPeriod} tags={tags} />;
}
