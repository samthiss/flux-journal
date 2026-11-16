import { accentColor, winColor, lossColor } from "@/lib/theme";

/**
 * What the two backtesting pages share: the type, the tables, the figures.
 */

export const fmtUsd = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toFixed(0)}`);

export const fmtPf = (pf: number | null) => (pf === null ? "—" : pf === Infinity ? "∞" : pf.toFixed(2));

export const fmtOffset = (o: number) => (o === 0 ? "0" : `${o > 0 ? "+" : "−"}${Math.abs(o)}`);

export const tone = (v: number) => (v > 0 ? winColor : v < 0 ? lossColor : "oklch(0.75 0.0118 290)");

export const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export const monthLabel = (key: string) => `${MOIS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export const label = { fontSize: 12, color: "oklch(0.6 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em" } as const;

export const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

export const fieldStyle: React.CSSProperties = {
  ...mono,
  fontSize: 13,
  padding: "9px 11px",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid oklch(0.34 0.0235 290)",
  background: "oklch(0.16 0.0176 290)",
  color: "oklch(0.9 0.01 290)",
  outline: "none",
};

export const th: React.CSSProperties = { ...label, fontSize: 11, textAlign: "left", padding: "8px 10px", borderBottom: "1px solid oklch(0.3 0.0176 290)", whiteSpace: "nowrap" };

export const td: React.CSSProperties = { ...mono, fontSize: 12.5, padding: "8px 10px", borderBottom: "1px solid oklch(0.24 0.0176 290)", whiteSpace: "nowrap" };

export function Field({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>{title}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: "oklch(0.5 0.0176 290)", marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

export function Figure({ title, value, hint, color }: { title: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <div style={{ ...label, fontSize: 11 }}>{title}</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 6, color: color ?? "oklch(0.96 0.004 290)" }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.0176 290)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 11.5,
        padding: "5px 10px",
        borderRadius: 5,
        cursor: "pointer",
        border: `1px solid ${active ? accentColor : "oklch(0.34 0.0235 290)"}`,
        background: active ? "oklch(0.68 0.19 293 / 0.14)" : "transparent",
        color: active ? accentColor : "oklch(0.7 0.0118 290)",
      }}
    >
      {children}
    </button>
  );
}

