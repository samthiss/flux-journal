import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
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
async function lastRiskPerLot(ownerId: string) {
  const last = await prisma.trade.findFirst({
    where: { ownerId, risk: { not: null }, size: { not: 0 } },
    orderBy: { date: "desc" },
    select: { risk: true, size: true },
  });
  return last?.risk ? last.risk / Math.abs(last.size) : null;
}

/**
 * The idea this trade came from, when the form was opened from one.
 *
 * Its case becomes the pre-trade analysis and its charts the trade's own:
 * everything was already written before the entry, and asking for it a second
 * time afterwards is how a journal stops being kept.
 */
async function ideePrealable(id: string | undefined, ownerId: string) {
  if (!id) return null;
  const idea = await prisma.tradeIdea.findFirst({
    // Read inside the reader's own journal: an id from another one is an id
    // that is not there, and the form opens blank.
    where: { id, ownerId },
    select: {
      zone: true,
      side: true,
      setup: true,
      closedAt: true,
      reason: true,
      cancelIf: true,
      confirmations: true,
      confirmationsBox: true,
      confirmationsReverse: true,
      tradeTypes: true,
      images: true,
    },
  });
  if (!idea) return null;

  const lignes = (raw: string | null) => {
    try {
      const parsed = JSON.parse(raw ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  };

  // The case for the trade is prose; the lists are lists, and the trade now
  // has a field for each of them. Writing them into the notes as well would be
  // the same words twice, one copy of which nothing can count.
  const notes = idea.reason;

  let urls: string[] = [];
  try {
    const parsed = JSON.parse(idea.images ?? "[]");
    if (Array.isArray(parsed)) urls = parsed.map((i: { url?: string }) => i?.url).filter((u): u is string => !!u);
  } catch {
    urls = [];
  }

  return {
    notes,
    urls,
    side: idea.side === "short" ? "Short" : "Long",
    // The idea was written under one of the Trading Plan's two lines, so the
    // trade's setup is already known.
    setup: idea.setup,
    tradeTypes: idea.tradeTypes ?? "",
    confirmations: idea.confirmations ?? "",
    confirmationsBox: idea.confirmationsBox ?? "",
    confirmationsReverse: idea.confirmationsReverse ?? "",
    // What would have called the trade off: the journal's own field for it.
    invalidReasons: JSON.stringify(lignes(idea.cancelIf)),
    zone: idea.zone ?? "",
    // The click that closed the position knew the hour; written up later, it
    // would be a guess.
    closedAt: idea.closedAt,
  };
}

export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string }>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const { idea } = await searchParams;
  const ownerId = await monJournal();
  const [riskPerLot, prealable] = await Promise.all([
    lastRiskPerLot(ownerId),
    ideePrealable(idea, ownerId),
  ]);

  return (
    <TradeForm
      action={createTrade}
      title="Add Trade"
      subtitle="Log a new entry to your journal"
      riskPerLot={riskPerLot}
      // The plan's captures, kept as their own section rather than laid into
      // the trade's four slots: those are for the charts taken afterwards.
      planCharts={prealable?.urls ?? []}
      // The instant, not a formatted hour: this runs on the server, whose
      // clock is UTC, and the journal is kept in the reader's own time.
      closedAt={prealable?.closedAt?.toISOString()}
      initial={{
        date: today,
        time: "",
        symbol: "",
        market: "",
        // What the form opens on when the trade did not come from a plan that
        // named a setup: the one being traded, which is the reverse.
        setup: prealable?.setup ?? "Backtest reverse",
        // Nothing to carry over: the plan does not name a school.
        strategy: "",
        side: prealable?.side ?? "Long",
        size: "",
        pnl: "",
        risk: "",
        tpReached: "",
        tradeTypes: prealable?.tradeTypes ?? "",
        zone: prealable?.zone ?? "",
        confirmations: prealable?.confirmations ?? "",
        confirmationsBox: prealable?.confirmationsBox ?? "",
        confirmationsReverse: prealable?.confirmationsReverse ?? "",
        validity: "",
        invalidReasons: prealable?.invalidReasons ?? "",
        emotion: "Calm",
        preTradeNotes: prealable?.notes ?? "",
        postTradeNotes: "",
        planFollowed: "",
      }}
    />
  );
}
