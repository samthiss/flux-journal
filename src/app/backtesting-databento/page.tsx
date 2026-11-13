import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import { PageTitle } from "@/components/NeonText";
import DatabentoClient from "@/components/DatabentoClient";

export const dynamic = "force-dynamic";

export default async function BacktestingDatabentoPage() {
  const ownerId = await monJournal();
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId }, orderBy: { symbol: "asc" } });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Backtesting Databento</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Tes niveaux rejoués sur l&apos;historique Databento : meilleure entrée, meilleur SL, meilleurs TP
        </div>
      </div>
      <DatabentoClient
        initial={rows.map((r) => ({
          symbol: r.symbol,
          zones: JSON.parse(r.zones) as number[],
          result: r.result,
          chosenKey: r.chosenKey,
        }))}
      />
    </div>
  );
}
