"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { accentColor, accentSoft, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import type { TradeForStats as Trade } from "@/lib/stats";

const selectStyle: React.CSSProperties = {
  background: "oklch(0.18 0.02 290)",
  border: "1px solid oklch(0.32 0.03 290 / 0.6)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "oklch(0.96 0.004 290)",
  fontFamily: "var(--font-space-grotesk), sans-serif",
  fontSize: 13,
};

const OPEN_NEW_TAB_KEY = "trades-open-new-tab";

export default function TradesClient({ trades }: { trades: Trade[] }) {
  const [filterSymbol, setFilterSymbol] = useState("all");
  const [filterSide, setFilterSide] = useState("all");
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [filterMarket, setFilterMarket] = useState("all");
  const [filterSetup, setFilterSetup] = useState("all");
  const [openInNewTab, setOpenInNewTab] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the preference from localStorage after mount
    setOpenInNewTab(localStorage.getItem(OPEN_NEW_TAB_KEY) === "1");
  }, []);

  const changeOpenInNewTab = (value: string) => {
    const next = value === "new-tab";
    setOpenInNewTab(next);
    localStorage.setItem(OPEN_NEW_TAB_KEY, next ? "1" : "0");
  };

  const symbolOptions = useMemo(() => [...new Set(trades.map((t) => t.symbol))], [trades]);
  const setupOptions = useMemo(() => [...new Set(trades.map((t) => t.setup))], [trades]);
  const marketOptions = useMemo(
    () => [...new Set(trades.map((t) => t.market).filter((m): m is string => !!m))],
    [trades]
  );

  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => filterSymbol === "all" || t.symbol === filterSymbol)
      .filter((t) => filterSide === "all" || t.side.toLowerCase() === filterSide)
      .filter((t) => filterOutcome === "all" || (t.pnl > 0 ? "win" : "loss") === filterOutcome)
      .filter((t) => filterMarket === "all" || t.market === filterMarket)
      .filter((t) => filterSetup === "all" || t.setup === filterSetup)
      .slice()
      .reverse();
  }, [trades, filterSymbol, filterSide, filterOutcome, filterMarket, filterSetup]);

  return (
    <div>
      <div className="trades-header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Trades</div>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.02 290)", marginTop: 4 }}>{filteredTrades.length} trades</div>
        </div>
        <Link
          href="/trades/new"
          style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 9, background: accentColor, color: "oklch(0.12 0.01 290)", textDecoration: "none" }}
        >
          + Add Trade
        </Link>
      </div>

      <div className="trades-filters" style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <select value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} style={selectStyle}>
          <option value="all">All symbols</option>
          {symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filterSide} onChange={(e) => setFilterSide(e.target.value)} style={selectStyle}>
          <option value="all">All sides</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)} style={selectStyle}>
          <option value="all">All outcomes</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
        </select>
        <select value={filterMarket} onChange={(e) => setFilterMarket(e.target.value)} style={selectStyle}>
          <option value="all">All markets</option>
          {marketOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={filterSetup} onChange={(e) => setFilterSetup(e.target.value)} style={selectStyle}>
          <option value="all">All setups</option>
          {setupOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={openInNewTab ? "new-tab" : "same-page"} onChange={(e) => changeOpenInNewTab(e.target.value)} style={selectStyle}>
          <option value="same-page">Ouvrir sur la même page</option>
          <option value="new-tab">Ouvrir dans un nouvel onglet</option>
        </select>
      </div>

      <div className="table-scroll" style={{ ...glassCard, padding: 0 }}>
        <div style={{ minWidth: 740 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 90px 70px 120px 70px 110px 90px 90px",
            padding: "14px 20px",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "oklch(0.55 0.02 290)",
            borderBottom: "1px solid oklch(0.3 0.02 290 / 0.6)",
          }}
        >
          <div>Date</div>
          <div>Symbol</div>
          <div>Side</div>
          <div>Setup</div>
          <div>Size</div>
          <div>P&amp;L</div>
          <div>R:R</div>
          <div>Outcome</div>
        </div>
        {filteredTrades.map((t) => {
          const outcome = t.pnl > 0 ? "win" : "loss";
          const pnlColor = t.pnl > 0 ? winColor : lossColor;
          return (
            <Link
              key={t.id}
              href={`/trades/${t.id}`}
              target={openInNewTab ? "_blank" : undefined}
              rel={openInNewTab ? "noopener noreferrer" : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 90px 70px 120px 70px 110px 90px 90px",
                padding: "15px 20px",
                fontSize: 13,
                alignItems: "center",
                borderBottom: "1px solid oklch(0.24 0.02 290 / 0.5)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ color: "oklch(0.62 0.02 290)", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12 }}>
                {t.date.toISOString().slice(0, 10)}
              </div>
              <div style={{ fontWeight: 600 }}>{t.symbol}</div>
              <div style={{ color: t.side === "Long" ? accentColor : "oklch(0.6 0.02 290)", fontSize: 12 }}>{t.side}</div>
              <div style={{ fontSize: 12, color: "oklch(0.65 0.01 290)" }}>{t.setup}</div>
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12, color: "oklch(0.72 0.01 290)" }}>
                {t.size}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontWeight: 600, color: pnlColor }}>
                {fmtMoney(t.pnl)}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12, color: "oklch(0.6 0.02 290)" }}>
                {t.rr != null ? `1 : ${t.rr.toFixed(1)}` : "—"}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: outcome === "win" ? accentSoft : "oklch(0.3 0.01 290)",
                    color: outcome === "win" ? winColor : "oklch(0.7 0.01 290)",
                  }}
                >
                  {outcome === "win" ? "Win" : "Loss"}
                </span>
              </div>
            </Link>
          );
        })}
        </div>
      </div>
    </div>
  );
}
