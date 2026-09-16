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
      side: true,
      setup: true,
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

  const conditions = lignes(idea.cancelIf);
  // Each list keeps its name: which chart said what is half of what the note
  // is worth re-reading for.
  const listes: [string, string | null][] = [
    ["Confirmation CC", idea.confirmations],
    ["Confirmation Box cluster", idea.confirmationsBox],
    ["Confirmation Reverse chart", idea.confirmationsReverse],
  ];
  const notes = [
    idea.reason,
    ...listes.map(([titre, brut]) => (lignes(brut).length ? `${titre} : ${lignes(brut).join(", ")}` : "")),
    conditions.length ? `Risk management : ${conditions.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
  };
}

/**
 * The Bilan questions, read off the post-market checklist rather than copied.
 *
 * They are the reader's own wording and they change there; a second copy in the
 * form would drift away from the list it came from.
 */
async function questionsBilan() {
  const rows = await prisma.checklistItem.findMany({
    where: { group: "Bilan" },
    orderBy: { order: "asc" },
    select: { label: true },
  });
  return rows.map((row) => row.label).filter(Boolean);
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
      // The idea's charts, laid into the slots in order: which chart is which
      // is not recorded on an idea, and a wrong label is easier to fix than a
      // lost screenshot.
      prefillCharts={prealable?.urls ?? []}
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
        zone: "",
        confirmations: prealable?.confirmations ?? "",
        validity: "",
        invalidReasons: "",
        emotion: "Calm",
        preTradeNotes: prealable?.notes ?? "",
        postTradeNotes: "",
      }}
    />
  );
}
