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
  const jar = await cookies();
  const stored = jar.get("dash-period")?.value;
  const initialPeriod = isValidPeriod(stored) ? stored : "week";

  // The prop-firm terms, as last edited. Only finite numbers survive the trip:
  // the cookie is whatever the browser sends, and a NaN in there would make
  // every simulated run return NaN rather than fail visibly.
  let initialChallenge: Record<string, number> = {};
  try {
    const raw = jar.get("challenge-params")?.value;
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) initialChallenge[k] = v;
      }
    }
  } catch {
    initialChallenge = {};
  }

  return <RapportClient trades={trades} initialPeriod={initialPeriod} initialChallenge={initialChallenge} />;
}
