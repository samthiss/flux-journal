import { prisma } from "@/lib/prisma";
import { TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import TradesClient from "@/components/TradesClient";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { date: "asc" },
    select: TRADE_FOR_STATS_SELECT,
  });

  return <TradesClient trades={trades} />;
}
