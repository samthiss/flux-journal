import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { parseTagArray } from "@/lib/tags";
import TradeForm, { type ExistingCharts } from "@/components/TradeForm";
import { updateTrade } from "@/lib/actions/trades";

export const dynamic = "force-dynamic";

/**
 * What one lot risked on the most recent trade that recorded it.
 *
 * The risk scales with the number of lots, so this is what lets the form fill
 * the field in from a size instead of asking for the same figure every time.
 */
async function lastRiskPerLot(ownerId: string) {
  const last = await prisma.trade.findFirst({
    where: { ownerId, risk: { not: null }, size: { not: 0 } },
    orderBy: { date: "desc" },
    select: { risk: true, size: true },
  });
  return last?.risk ? last.risk / Math.abs(last.size) : null;
}


export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerId = await monJournal();
  // Looked for in the reader's own journal: somebody else's trade is not
  // editable here because it is not here.
  const trade = await prisma.trade.findFirst({ where: { id, ownerId } });
  if (!trade) notFound();

  const updateTradeWithId = updateTrade.bind(null, trade.id);
  const [riskPerLot] = await Promise.all([
    lastRiskPerLot(ownerId),
  ]);

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
        side: trade.side,
        size: String(trade.size),
        pnl: String(trade.pnl),
        risk: trade.risk != null ? String(trade.risk) : "",
        tpReached: trade.tpReached != null ? String(trade.tpReached) : "",
        tradeTypes: trade.tradeTypes ?? "",
        zone: trade.zone ?? "",
        confirmations: trade.confirmations ?? "",
        confirmationsBox: trade.confirmationsBox ?? "",
        confirmationsReverse: trade.confirmationsReverse ?? "",
        validity: trade.validity ?? "",
        invalidReasons: trade.invalidReasons ?? "",
        emotion: trade.emotion ?? "Calm",
        preTradeNotes: trade.preTradeNotes ?? "",
        postTradeNotes: trade.postTradeNotes ?? "",
        planFollowed: trade.planFollowed === null ? "" : trade.planFollowed ? "oui" : "non",
      }}
    />
  );
}
