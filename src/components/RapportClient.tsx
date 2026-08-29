"use client";

import { useMemo, useState } from "react";
import ProfitabilityCard from "@/components/ProfitabilityCard";
import ChallengeCard from "@/components/ChallengeCard";
import PeriodFilter from "@/components/PeriodFilter";
import { PageTitle } from "@/components/NeonText";
import {
  withOutcome,
  filterByPeriod,
  computeDashboardStats,
  computeSetupStats,
  type TradeForStats,
} from "@/lib/stats";

export default function RapportClient({
  trades,
  initialPeriod,
  initialChallenge,
}: {
  trades: TradeForStats[];
  initialPeriod: string;
  initialChallenge: Record<string, number>;
}) {
  // The period is shared with the dashboard, through the same cookie: the two
  // pages read the same journal, and having them disagree on which weeks are
  // being counted would make the figures impossible to compare.
  const [period, setPeriod] = useState(initialPeriod);
  const choosePeriod = (next: string) => {
    setPeriod(next);
    try {
      document.cookie = `dash-period=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    } catch {}
  };

  const now = useMemo(() => new Date(), []);
  const periodTrades = useMemo(
    () => filterByPeriod(withOutcome(trades), period, now),
    [trades, period, now]
  );
  const stats = useMemo(() => computeDashboardStats(periodTrades), [periodTrades]);
  const setupStats = useMemo(() => computeSetupStats(periodTrades), [periodTrades]);

  return (
    <div>
      <div className="dash-header">
        <div>
          <PageTitle>Rapport</PageTitle>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
            {periodTrades.length} trades sur la période
          </div>
        </div>
        <div className="dash-filters">
          <PeriodFilter period={period} onChange={choosePeriod} />
        </div>
      </div>

      <ProfitabilityCard stats={stats} setups={setupStats} />
      <ChallengeCard trades={periodTrades} initialSettings={initialChallenge} />
    </div>
  );
}
