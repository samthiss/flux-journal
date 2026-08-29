"use client";

import { useState } from "react";
import { accentColor } from "@/lib/theme";
import { buildCustomPeriod, parseCustomPeriod } from "@/lib/stats";

const FIXED = [
  ["today", "Today"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["all", "All Time"],
] as const;

const controlStyle: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: 13,
  padding: "10px 14px",
  borderRadius: 9,
  border: "1px solid oklch(0.36 0.05 250 / 0.6)",
  background: "oklch(0.18 0.034 250)",
  color: "oklch(0.85 0.017 250)",
  cursor: "pointer",
  outline: "none",
};

/**
 * The period the dashboard and the report are both read through.
 *
 * One component for both pages, and one cookie behind them: two selectors that
 * could drift would leave the same journal showing two different sets of
 * figures. A custom range is the same `period` string as the fixed choices
 * (`custom:<from>:<to>`), so nothing downstream has to know it exists.
 */
export default function PeriodFilter({
  period,
  onChange,
}: {
  period: string;
  onChange: (next: string) => void;
}) {
  const custom = parseCustomPeriod(period);
  // Held here as well as in the period string so that typing one bound does not
  // wipe the other, and so an empty field stays empty while it is being filled.
  const [from, setFrom] = useState(custom?.from ?? "");
  const [to, setTo] = useState(custom?.to ?? "");

  const chooseCustom = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    onChange(buildCustomPeriod(nextFrom, nextTo));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
      <select
        value={custom ? "custom" : period}
        onChange={(e) => (e.target.value === "custom" ? chooseCustom(from, to) : onChange(e.target.value))}
        style={controlStyle}
      >
        {FIXED.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
        <option value="custom">Personnalisé…</option>
      </select>

      {custom && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => chooseCustom(e.target.value, to)}
            aria-label="Date de début"
            style={{ ...controlStyle, colorScheme: "dark", borderColor: `${accentColor.slice(0, -1)} / 0.35)` }}
          />
          <span style={{ fontSize: 12, color: "oklch(0.55 0.03 250)" }}>→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => chooseCustom(from, e.target.value)}
            aria-label="Date de fin"
            style={{ ...controlStyle, colorScheme: "dark", borderColor: `${accentColor.slice(0, -1)} / 0.35)` }}
          />
          {(from || to) && (
            <span
              onClick={() => chooseCustom("", "")}
              title="Vider les dates"
              style={{ fontSize: 12, color: "oklch(0.55 0.03 250)", cursor: "pointer", padding: "0 2px" }}
            >
              ✕
            </span>
          )}
        </div>
      )}
    </div>
  );
}
