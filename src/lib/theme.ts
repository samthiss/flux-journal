import type { CSSProperties } from "react";

// Violet on a near-black faintly tinted the same way: the accent marks what
// worked and what can be clicked; a losing figure is not shouted, it is a
// quiet grey beside it.
export const accentColor = "oklch(0.68 0.19 293)";
export const accentSoft = "oklch(0.68 0.19 293 / 0.16)";
export const winColor = "oklch(0.76 0.15 293)";
export const lossColor = "oklch(0.74 0.02 290)";

/**
 * The third light, for the news band alone.
 *
 * Violet and grey already mean something here — a trade that worked and one
 * that did not — so a band in either would read as a verdict on the day.
 * Amber says wire service and belongs to nothing else in the journal.
 */
export const newsColor = "oklch(0.82 0.16 75)";

/** A soft halo in an element's own colour, sized to how much it should stand out. */
export function neonGlow(color: string, strength: 1 | 2 | 3 = 2) {
  const spread = { 1: 6, 2: 12, 3: 22 }[strength];
  return `0 0 ${spread}px ${color.replace(")", " / 0.25)")}`;
}

export const glassCard: CSSProperties = {
  background: "oklch(0.19 0.02 290 / 0.55)",
  backdropFilter: "blur(16px)",
  border: "1px solid oklch(0.36 0.03 290 / 0.45)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 10px 40px -16px oklch(0.68 0.19 293 / 0.25)",
};

/** Page headings: plain and bold. */
export const pageTitle: CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
};

export function fmtMoney(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
