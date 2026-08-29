import { prisma } from "@/lib/prisma";
import TradeForm from "@/components/TradeForm";
import { createTrade } from "@/lib/actions/trades";

export const dynamic = "force-dynamic";

// This page lives at /trade/new rather than /trades/new on purpose. One segment
// under /trades is the space the trade-detail modal intercepts, so a click on
// "Add Trade" was intercepted as a trade whose id is "new", found nothing, and
// rendered a 404 — which a reload then "fixed", a reload being a fresh request
// that no interceptor sees. Outside that segment there is nothing to intercept.

/**
 * What one lot risked on the most recent trade that recorded it.
 *
 * The risk scales with the number of lots, so this is what lets the form fill
 * the field in from a size instead of asking for the same figure every time.
 */
async function lastRiskPerLot() {
  const last = await prisma.trade.findFirst({
    where: { risk: { not: null }, size: { not: 0 } },
    orderBy: { date: "desc" },
    select: { risk: true, size: true },
  });
  return last?.risk ? last.risk / Math.abs(last.size) : null;
}

export default async function NewTradePage() {
  const today = new Date().toISOString().slice(0, 10);
  const riskPerLot = await lastRiskPerLot();

  return (
    <TradeForm
      action={createTrade}
      title="Add Trade"
      subtitle="Log a new entry to your journal"
      riskPerLot={riskPerLot}
      initial={{
        date: today,
        time: "",
        symbol: "",
        market: "",
        setup: "Trend run",
        side: "Long",
        size: "",
        pnl: "",
        risk: "",
        emotion: "Calm",
        preTradeNotes: "",
        postTradeNotes: "",
      }}
    />
  );
}
