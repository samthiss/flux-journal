import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { PageTitle } from "@/components/NeonText";
import BacktestClient from "@/components/BacktestClient";
import { DEFAULT_MARKETS } from "@/lib/markets";

export const dynamic = "force-dynamic";

export default async function BacktestingPage() {
  const ownerId = await monJournal();
  const [rows, trades] = await Promise.all([
    prisma.backtestTrade.findMany({ where: { ownerId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    // The names the journal already trades under, offered as suggestions so a
    // test and a real trade are described in the same words.
    prisma.trade.findMany({ where: { ownerId }, select: { strategy: true, setup: true, symbol: true } }),
  ]);

  const uniques = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x && x !== "UNKNOWN"))].sort();

  const strategies = uniques([
    "Volume academy",
    "Jahreswiderstand",
    ...trades.flatMap((t) => [t.strategy, t.setup]),
    ...rows.map((r) => r.strategy),
  ]);
  const symbols = uniques([...DEFAULT_MARKETS, ...trades.map((t) => t.symbol), ...rows.map((r) => r.symbol)]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Backtesting</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Une stratégie testée sous plusieurs SL, TP et entrées, symbole par symbole et mois par mois
        </div>
      </div>
      <BacktestClient
        initialRows={rows.map((r) => ({ ...r, date: r.date.toISOString(), createdAt: r.createdAt.toISOString() }))}
        strategies={strategies}
        symbols={symbols}
      />
    </div>
  );
}
