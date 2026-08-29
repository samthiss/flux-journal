import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TradeForm, { type ExistingCharts } from "@/components/TradeForm";
import { updateTrade } from "@/lib/actions/trades";

export const dynamic = "force-dynamic";

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


export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) notFound();

  const updateTradeWithId = updateTrade.bind(null, trade.id);
  const riskPerLot = await lastRiskPerLot();

  const existingCharts: ExistingCharts = {
    cluster: trade.chartCluster ?? undefined,
    reverse: trade.chartReverse ?? undefined,
    box: trade.chartBox ?? undefined,
    trading: trade.chartTrading ?? undefined,
  };

  return (
    <TradeForm
      action={updateTradeWithId}
      tradeId={trade.id}
      riskPerLot={riskPerLot}
      title="Edit Trade"
      subtitle="Update this journal entry"
      existingCharts={existingCharts}
      initial={{
        date: trade.date.toISOString().slice(0, 10),
        time: trade.time ?? "",
        symbol: trade.symbol,
        market: trade.market ?? "",
        setup: trade.setup,
        side: trade.side,
        size: String(trade.size),
        pnl: String(trade.pnl),
        risk: trade.risk != null ? String(trade.risk) : "",
        emotion: trade.emotion ?? "Calm",
        preTradeNotes: trade.preTradeNotes ?? "",
        postTradeNotes: trade.postTradeNotes ?? "",
      }}
    />
  );
}
