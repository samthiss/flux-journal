import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TradeForm, { type ExistingCharts } from "@/components/TradeForm";
import { updateTrade } from "@/lib/actions/trades";

export const dynamic = "force-dynamic";

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) notFound();

  const updateTradeWithId = updateTrade.bind(null, trade.id);

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
        rr: trade.rr != null ? String(trade.rr) : "",
        emotion: trade.emotion ?? "Calm",
        preTradeNotes: trade.preTradeNotes ?? "",
        postTradeNotes: trade.postTradeNotes ?? "",
      }}
    />
  );
}
