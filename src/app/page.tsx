import { prisma } from "@/lib/prisma";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const trades = await prisma.trade.findMany({ orderBy: { date: "asc" } });

  return <DashboardClient trades={trades} />;
}
