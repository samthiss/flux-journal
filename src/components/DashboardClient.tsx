"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { accentColor, accentSoft, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import { CountUp, PageTitle } from "@/components/NeonText";
import PeriodFilter from "@/components/PeriodFilter";
import {
  withOutcome,
  filterByPeriod,
  computeDashboardStats,
  buildMonthlyCalendar,
  type TradeForStats,
} from "@/lib/stats";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function DashboardClient({ trades, initialPeriod }: { trades: TradeForStats[]; initialPeriod: string }) {
  // The chosen period comes from the server, read out of a cookie, so the first
  // paint is already the right one — the same reason the notes tree stores its
  // folds server-side. Read after hydration it would have shown this week's
  // figures for a moment and then counted them up a second time.
  const [period, setPeriod] = useState(initialPeriod);

  const choosePeriod = (next: string) => {
    setPeriod(next);
    try {
      document.cookie = `dash-period=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    } catch {}
  };
  const [filterSymbol, setFilterSymbol] = useState("all");
  const [filterSetup, setFilterSetup] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = (filterSymbol !== "all" ? 1 : 0) + (filterSetup !== "all" ? 1 : 0);

  const allTrades = useMemo(() => withOutcome(trades), [trades]);
  const symbolOptions = useMemo(() => [...new Set(allTrades.map((t) => t.symbol))], [allTrades]);
  const setupOptions = useMemo(() => [...new Set(allTrades.map((t) => t.setup))], [allTrades]);

  const now = useMemo(() => new Date(), []);
  const periodTrades = useMemo(() => {
    return filterByPeriod(allTrades, period, now)
      .filter((t) => filterSymbol === "all" || t.symbol === filterSymbol)
      .filter((t) => filterSetup === "all" || t.setup === filterSetup);
  }, [allTrades, period, filterSymbol, filterSetup, now]);

  const stats = useMemo(() => computeDashboardStats(periodTrades), [periodTrades]);
  const calendarCells = useMemo(
    () => buildMonthlyCalendar(allTrades, now.getFullYear(), now.getMonth()),
    [allTrades, now]
  );
  const calendarMonthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // pathLength="1" on the circle below makes the arc one unit long whatever its
  // radius, so the share of it that is drawn is the win rate itself.
  const winRateArc = stats.winRate.toFixed(4);

  // Each card counts up to its figure, so `value` is the number and `format`
  // says how to write it at any point along the way.
  const streakLabel = stats.streakType === "win" ? "Wins" : "Losses";
  const metricCards = [
    { label: "Avg Win", value: stats.avgWin, format: fmtMoney, sub: `${stats.wins.length} winning trades`, color: winColor },
    { label: "Avg Loss", value: stats.avgLoss, format: fmtMoney, sub: `${stats.losses.length} losing trades`, color: lossColor },
    { label: "Profit Factor", value: stats.profitFactor, format: (n: number) => n.toFixed(2), sub: "gross win / gross loss", color: "oklch(0.96 0.0068 250)" },
    {
      label: "Risk / Reward",
      value: stats.avgRR,
      format: (n: number) => (stats.rrCount ? `1 : ${n.toFixed(2)}` : "—"),
      sub: stats.rrCount ? `sur ${stats.rrCount} trade${stats.rrCount > 1 ? "s" : ""} renseigné${stats.rrCount > 1 ? "s" : ""}` : "risque non renseigné",
      color: "oklch(0.96 0.0068 250)",
    },
    { label: "Best Trade", value: stats.best, format: fmtMoney, sub: "single-trade high", color: winColor },
    { label: "Worst Trade", value: stats.worst, format: fmtMoney, sub: "single-trade low", color: lossColor },
    {
      label: "Current Streak",
      value: stats.streak,
      format: (n: number) => `${Math.round(n)} ${streakLabel}`,
      sub: "consecutive trades",
      color: stats.streakType === "win" ? winColor : lossColor,
    },
    { label: "Total Trades", value: periodTrades.length, format: (n: number) => `${Math.round(n)}`, sub: "this period", color: "oklch(0.96 0.0068 250)" },
  ];

  const selectStyle: React.CSSProperties = {
    fontFamily: "var(--font-space-grotesk), sans-serif",
    fontSize: 13,
    color: "oklch(0.9 0.0085 250)",
    background: "oklch(0.18 0.034 250)",
    padding: "9px 14px",
    border: "1px solid oklch(0.32 0.051 250 / 0.6)",
    borderRadius: 8,
    whiteSpace: "nowrap",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div>
      <div className="dash-header">
        <div style={{ minWidth: 0 }}>
          <PageTitle>Dashboard</PageTitle>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4, whiteSpace: "nowrap" }}>
            {periodTrades.length} trades in period
          </div>
        </div>
        <div className="dash-filters">
          <div
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              ...selectStyle,
              display: "flex",
              alignItems: "center",
              gap: 8,
              userSelect: "none",
              color: activeFilterCount > 0 ? accentColor : selectStyle.color,
              border: activeFilterCount > 0 ? `1px solid ${accentColor}` : selectStyle.border,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13">
              <path d="M1 2h11M3.5 6.5h6M5.5 11h1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }}>
              <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <PeriodFilter period={period} onChange={choosePeriod} />
          <Link
            href="/trade/new"
            style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 9, background: accentColor, color: "oklch(0.12 0.017 250)", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            + Add Trade
          </Link>
        </div>
      </div>

      {filtersOpen && (
        <div
          style={{
            ...glassCard,
            padding: 16,
            marginBottom: 20,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <select
            value={filterSymbol}
            onChange={(e) => {
              setFilterSymbol(e.target.value);
              setFiltersOpen(false);
            }}
            style={selectStyle}
          >
            <option value="all">All symbols</option>
            {symbolOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterSetup}
            onChange={(e) => {
              setFilterSetup(e.target.value);
              setFiltersOpen(false);
            }}
            style={selectStyle}
          >
            <option value="all">All setups</option>
            {setupOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {activeFilterCount > 0 && (
            <div
              onClick={() => {
                setFilterSymbol("all");
                setFilterSetup("all");
                setFiltersOpen(false);
              }}
              style={{
                ...selectStyle,
                cursor: "pointer",
                color: "oklch(0.7 0.25 18)",
                border: "1px solid oklch(0.62 0.24 18 / 0.5)",
              }}
            >
              Clear
            </div>
          )}
        </div>
      )}

      <div className="dash-top-grid">
        <div style={{ ...glassCard, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="58" fill="none" stroke="oklch(0.28 0.034 250)" strokeWidth="12" />
            <circle
              className="ring-fill"
              cx="70"
              cy="70"
              r="58"
              fill="none"
              stroke={accentColor}
              strokeWidth="12"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${winRateArc} 1`}
              transform="rotate(-90 70 70)"
              style={{ ["--arc" as string]: winRateArc, filter: `drop-shadow(0 0 6px ${accentColor})` }}
            />
            <text x="70" y="68" textAnchor="middle" fontFamily="var(--font-jetbrains-mono), monospace" fontSize="26" fontWeight="600" fill="#f5f4f8">
              <CountUp value={stats.winRate * 100} format={(n) => `${Math.round(n)}%`} duration={1100} />
            </text>
            <text x="70" y="86" textAnchor="middle" fontFamily="var(--font-space-grotesk), sans-serif" fontSize="11" letterSpacing="0.06em" fill="oklch(0.6 0.034 250)">
              WIN RATE
            </text>
          </svg>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
            {stats.wins.length}W &nbsp;/&nbsp; {stats.losses.length}L
          </div>
        </div>

        <div style={{ ...glassCard, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Equity Curve
            </div>
            <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 18, fontWeight: 600, color: stats.totalPnl >= 0 ? winColor : lossColor }}>
              <CountUp value={stats.totalPnl} format={fmtMoney} duration={1100} />
            </div>
          </div>
          <svg viewBox="0 0 600 150" style={{ width: "100%", height: 150, flex: 1 }} preserveAspectRatio="none">
            <line x1="0" y1="75" x2="600" y2="75" stroke="oklch(0.3 0.034 250)" strokeWidth="1" strokeDasharray="4 4" />
            <polyline
              className="draw-stroke"
              // Re-mounts when the shape changes, so switching period draws the
              // new curve rather than leaving the old one's animation finished.
              key={stats.equityPoints}
              points={stats.equityPoints}
              pathLength={1}
              fill="none"
              stroke={accentColor}
              strokeWidth="2.5"
              style={{ filter: `drop-shadow(0 0 5px ${accentColor})` }}
            />
            <polygon className="fade-in" key={stats.equityFillPoints} points={stats.equityFillPoints} fill={accentSoft} />
          </svg>
        </div>
      </div>

      <div className="dash-metrics-grid">
        {metricCards.map((m) => (
          <div key={m.label} style={glassCard}>
            <div style={{ fontSize: 12, color: "oklch(0.6 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</div>
            <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 24, fontWeight: 600, marginTop: 8, color: m.color }}>
              <CountUp value={m.value} format={m.format} />
            </div>
            <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", marginTop: 4 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...glassCard, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Monthly Calendar
          </div>
          <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 13, color: "oklch(0.6 0.034 250)" }}>
            {calendarMonthLabel}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, marginBottom: 8 }}>
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, color: "oklch(0.5 0.034 250)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
          {calendarCells.map((c, i) => {
            const has = c.hasTrades;
            const isWin = c.isWin;
            const bg = has ? (isWin ? accentSoft : "oklch(0.3 0.017 250 / 0.5)") : "oklch(0.17 0.0255 250 / 0.4)";
            const border = has ? (isWin ? "oklch(0.84 0.17 196 / 0.5)" : "oklch(0.45 0.017 250 / 0.4)") : "oklch(0.28 0.034 250 / 0.4)";
            return (
              <div
                key={i}
                style={{
                  borderRadius: 8,
                  padding: 8,
                  minHeight: 56,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  background: bg,
                  border: `1px solid ${border}`,
                  overflow: "hidden",
                  minWidth: 0,
                }}
              >
                {c.isDay && (
                  <>
                    <div style={{ fontSize: 12, color: "oklch(0.75 0.034 250)" }}>{c.dayNum}</div>
                    <div
                      style={{
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        fontSize: 11,
                        fontWeight: 600,
                        color: has ? (isWin ? winColor : lossColor) : "transparent",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {has ? fmtMoney(c.pnl!) : ""}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
