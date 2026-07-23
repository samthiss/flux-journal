import type { CSSProperties } from "react";

export const accentColor = "oklch(0.68 0.19 293)";
export const accentSoft = "oklch(0.68 0.19 293 / 0.16)";
export const winColor = accentColor;
export const lossColor = "oklch(0.58 0.015 290)";

export const glassCard: CSSProperties = {
  background: "oklch(0.19 0.02 290 / 0.55)",
  backdropFilter: "blur(16px)",
  border: "1px solid oklch(0.36 0.03 290 / 0.45)",
  borderRadius: 16,
  padding: 24,
  boxShadow:
    "0 0 0 1px oklch(0.68 0.19 293 / 0.04), 0 10px 40px -12px oklch(0.68 0.19 293 / 0.25)",
};

export function fmtMoney(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
