import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";
import DatabentoClient from "@/components/DatabentoClient";

export const dynamic = "force-dynamic";

export default async function BacktestingDatabentoPage() {
  const ownerId = await monJournal();
  const rows = await prisma.databentoSymbol.findMany({ where: { ownerId }, orderBy: { symbol: "asc" } });

  return (
    <div>
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
