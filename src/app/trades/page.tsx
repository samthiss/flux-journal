import { prisma } from "@/lib/prisma";
import TradesClient from "@/components/TradesClient";

export default async function TradesPage() {
  const trades = await prisma.trade.findMany({ orderBy: { date: "asc" } });

  return <TradesClient trades={trades} />;
}
