import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { PERIODS, TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { date: "asc" },
    select: TRADE_FOR_STATS_SELECT,
  });

  // Anything but one of the four known periods is ignored rather than trusted:
  // the cookie is whatever the browser sends, and an unknown value would filter
  // every trade out and show an empty dashboard.
  const stored = (await cookies()).get("dash-period")?.value;
  const initialPeriod = PERIODS.includes(stored as (typeof PERIODS)[number]) ? stored! : "week";

  return <DashboardClient trades={trades} initialPeriod={initialPeriod} />;
}
