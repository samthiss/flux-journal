import { prisma } from "@/lib/prisma";
import { TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { date: "asc" },
    select: TRADE_FOR_STATS_SELECT,
  });

  return <DashboardClient trades={trades} />;
}
