import type { CSSProperties } from "react";

// Cyberpunk palette: electric cyan against a cold near-black, with magenta as
// the second neon. Wins glow cyan, losses glow magenta — the two colours the
// whole interface is lit by, so nothing else needs to compete with them.
export const accentColor = "oklch(0.84 0.17 196)";
export const accentSoft = "oklch(0.84 0.17 196 / 0.16)";
export const magentaColor = "oklch(0.72 0.27 340)";
export const winColor = accentColor;
export const lossColor = magentaColor;

/** The halo every lit element carries, sized to how loud the element should be. */
export function neonGlow(color: string, strength: 1 | 2 | 3 = 2) {
  const spread = { 1: 6, 2: 14, 3: 26 }[strength];
  return `0 0 ${spread}px ${color.replace(")", " / 0.45)")}`;
}

export const glassCard: CSSProperties = {
  background: "oklch(0.17 0.03 250 / 0.62)",
  backdropFilter: "blur(16px)",
  border: "1px solid oklch(0.84 0.17 196 / 0.22)",
  // Corners cut on the diagonal rather than rounded — the panel edge of every
  // console in the genre. 14px matches the radius this card used to carry.
  clipPath: "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)",
  padding: 24,
  boxShadow:
    "inset 0 0 0 1px oklch(0.84 0.17 196 / 0.06), 0 0 24px -6px oklch(0.84 0.17 196 / 0.28), 0 14px 44px -14px oklch(0 0 0 / 0.8)",
};

/** Page headings: mono, spaced and lit, like a panel label rather than prose. */
export const pageTitle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: 22,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  textShadow: "0 0 14px oklch(0.84 0.17 196 / 0.35)",
};

export function fmtMoney(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
