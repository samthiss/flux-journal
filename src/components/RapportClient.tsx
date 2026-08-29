"use client";

import { useMemo, useState } from "react";
import ProfitabilityCard from "@/components/ProfitabilityCard";
import { PageTitle } from "@/components/NeonText";
import {
  withOutcome,
  filterByPeriod,
  computeDashboardStats,
  computeSetupStats,
  type TradeForStats,
} from "@/lib/stats";

const PERIOD_LABELS: Record<string, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

export default function RapportClient({
  trades,
  initialPeriod,
}: {
  trades: TradeForStats[];
  initialPeriod: string;
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
          <select
            value={period}
            onChange={(e) => choosePeriod(e.target.value)}
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 13,
              padding: "10px 14px",
              borderRadius: 9,
              border: "1px solid oklch(0.36 0.05 250 / 0.6)",
              background: "oklch(0.18 0.034 250)",
              color: "oklch(0.85 0.017 250)",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {Object.entries(PERIOD_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ProfitabilityCard stats={stats} setups={setupStats} />
    </div>
  );
}
