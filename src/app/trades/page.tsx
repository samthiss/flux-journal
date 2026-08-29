import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { isValidPeriod, TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import TradesClient from "@/components/TradesClient";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { date: "asc" },
    select: TRADE_FOR_STATS_SELECT,
  });

  const stored = (await cookies()).get("dash-period")?.value;
  const initialPeriod = isValidPeriod(stored) ? stored : "week";

  return <TradesClient trades={trades} initialPeriod={initialPeriod} />;
}
