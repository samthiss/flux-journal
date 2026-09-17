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
   * What each trade is annotated with, said rather than shown.
   *
   * A pile of chips made "Range" and "Nervous" look like the same kind of
   * thing. Each line names what it is — Emotion, Type, Zone, and one line per
   * confirmation list — and a line with nothing on it is left out.
   */
  const details = Object.fromEntries(
    trades.map((t) => {
      const lignes: [string, string][] = [
        ["Emotion", t.emotion ?? ""],
        ["Type", parseTagArray(t.tradeTypes).join(", ")],
        ["Zone", t.zone ?? ""],
        ["Confirmation CC", parseTagArray(t.confirmations).join(", ")],
        ["Confirmation Box cluster", parseTagArray(t.confirmationsBox).join(", ")],
        ["Confirmation Reverse chart", parseTagArray(t.confirmationsReverse).join(", ")],
        ["Risk management", parseTagArray(t.invalidReasons).join(", ")],
        ["Plan respecté", t.planFollowed === null ? "" : t.planFollowed ? "Oui" : "Non"],
      ];
      return [t.id, lignes.filter(([, valeur]) => valeur)];
    })
  );

  return <TradesClient trades={trades} initialPeriod={initialPeriod} details={details} />;
}
