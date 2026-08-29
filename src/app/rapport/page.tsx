import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isValidPeriod, TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import RapportClient from "@/components/RapportClient";

export const dynamic = "force-dynamic";

export default async function RapportPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { date: "asc" },
    select: TRADE_FOR_STATS_SELECT,
  });

  // Same cookie as the dashboard, validated the same way: an unknown value
  // would filter every trade out and show an empty report.
  const stored = (await cookies()).get("dash-period")?.value;
  const initialPeriod = isValidPeriod(stored) ? stored : "week";

  return <RapportClient trades={trades} initialPeriod={initialPeriod} />;
}
