import { getTradeVocabularies } from "@/lib/actions/tradeIdeas";
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

/**
 * The idea this trade came from, when the form was opened from one.
 *
 * Its case becomes the pre-trade analysis and its charts the trade's own:
 * everything was already written before the entry, and asking for it a second
 * time afterwards is how a journal stops being kept.
 */
async function ideePrealable(id: string | undefined) {
  if (!id) return null;
  const idea = await prisma.tradeIdea.findUnique({
    where: { id },
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

/**
 * The Bilan questions, read off the post-market checklist rather than copied.
 *
 * They are the reader's own wording and they change there; a second copy in the
 * form would drift away from the list it came from.
 */
/**
 * "Ai-je respecté mon plan ?", which the form answers with two chips.
 *
 * Matched on the question rather than on its exact wording, which lives in the
 * checklist and can be rewritten there.
 */
const EST_RESPECT_DU_PLAN = /respect\S*\s+(mon|le)\s+plan/i;

async function questionsBilan() {
  const rows = await prisma.checklistItem.findMany({
    where: { group: "Bilan" },
    orderBy: { order: "asc" },
    select: { label: true },
  });
  return rows.map((row) => row.label).filter((label) => label && !EST_RESPECT_DU_PLAN.test(label));
}

export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string }>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const { idea } = await searchParams;
  const [riskPerLot, vocabulary, prealable, bilan] = await Promise.all([
    lastRiskPerLot(),
    getTradeVocabularies(),
    ideePrealable(idea),
    questionsBilan(),
  ]);

  return (
    <TradeForm
      action={createTrade}
      title="Add Trade"
      subtitle="Log a new entry to your journal"
      vocabulary={vocabulary}
      riskPerLot={riskPerLot}
      // The plan's captures, kept as their own section rather than laid into
      // the trade's four slots: those are for the charts taken afterwards.
      planCharts={prealable?.urls ?? []}
      // The instant, not a formatted hour: this runs on the server, whose
      // clock is UTC, and the journal is kept in the reader's own time.
      closedAt={prealable?.closedAt?.toISOString()}
      bilanQuestions={bilan}
      initial={{
        date: today,
        time: "",
        symbol: "",
        market: "",
        setup: prealable?.setup ?? "Trend run",
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
