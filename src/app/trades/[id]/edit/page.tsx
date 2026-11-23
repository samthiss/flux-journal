import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { parseTagArray } from "@/lib/tags";
import TradeForm, { type ExistingCharts } from "@/components/TradeForm";
import { updateTrade } from "@/lib/actions/trades";
import { levelPlans } from "@/lib/databento/plans";

export const dynamic = "force-dynamic";



export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerId = await monJournal();
  // Looked for in the reader's own journal: somebody else's trade is not
  // editable here because it is not here.
  const trade = await prisma.trade.findFirst({ where: { id, ownerId } });
  if (!trade) notFound();

  const updateTradeWithId = updateTrade.bind(null, trade.id);
  const plans = await levelPlans(ownerId);

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
      plans={plans}
      // Carried through the form, or editing a trade would drop the plan it
      // was written from.
      planCharts={parseTagArray(trade.planCharts)}
      title="Edit Trade"
      subtitle="Update this journal entry"
      existingCharts={existingCharts}
      initial={{
        date: trade.date.toISOString().slice(0, 10),
        time: trade.time ?? "",
        symbol: trade.symbol,
        market: trade.market ?? "",
        setup: trade.setup,
        strategy: trade.strategy ?? "",
        entryType: trade.entryType ?? "",
        side: trade.side,
        size: String(trade.size),
        pnl: String(trade.pnl),
        tpReached: trade.tpReached != null ? String(trade.tpReached) : "",
        tradeTypes: trade.tradeTypes ?? "",
        zone: trade.zone ?? "",
        confirmations: trade.confirmations ?? "",
        confirmationsBox: trade.confirmationsBox ?? "",
        confirmationsReverse: trade.confirmationsReverse ?? "",
        validity: trade.validity ?? "",
        invalidReasons: trade.invalidReasons ?? "",
        emotion: trade.emotion ?? "",
        preTradeNotes: trade.preTradeNotes ?? "",
        postTradeNotes: trade.postTradeNotes ?? "",
        level: trade.level != null ? String(trade.level) : "",
        slPrice: trade.slPrice != null ? String(trade.slPrice) : "",
        tp1Price: trade.tp1Price != null ? String(trade.tp1Price) : "",
        tp2Price: trade.tp2Price != null ? String(trade.tp2Price) : "",
        trailPrice: trade.trailPrice != null ? String(trade.trailPrice) : "",
        outcome: trade.outcome ?? "",
        planFollowed: trade.planFollowed === null ? "" : trade.planFollowed ? "oui" : "non",
      }}
    />
  );
}
