import type { CSSProperties } from "react";

// A market terminal: black, with orange for labels, keys and what can be
// clicked; green for a gain and red for a loss, nothing softer.
export const accentColor = "oklch(0.79 0.17 66)";
export const accentSoft = "oklch(0.79 0.17 66 / 0.16)";
export const winColor = "oklch(0.77 0.18 152)";
export const lossColor = "oklch(0.67 0.21 25)";

/**
 * Neither: a trade taken off at the entry.
 *
 * Grey rather than a paler red, because that is the point — a breakeven used
 * to be drawn as a loss, and the colour was most of what said so.
 */
export const neutralColor = "oklch(0.72 0 0)";

/**
 * The third light, for the news band alone.
 *
 * Orange is the terminal's own colour and green and red say how a trade went,
 * so the releases get a cyan of their own.
 */
export const newsColor = "oklch(0.78 0.12 225)";

/** No halos on a terminal: kept so the components that ask for one get nothing. */
export function neonGlow(_color: string, _strength: 1 | 2 | 3 = 2) {
  return "none";
}

/** A panel: black, one grey rule round it, square corners. */
export const glassCard: CSSProperties = {
  background: "#000",
  border: "1px solid #2E2E2E",
  borderRadius: 0,
  padding: 16,
};

/** Page headings: the terminal's orange, mono and capitals. */
export const pageTitle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: 20,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "oklch(0.79 0.17 66)",
};

export function fmtMoney(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
