import type { CSSProperties } from "react";
import { glassCard } from "@/lib/theme";

type Row = {
  step: number;
  color: string;
  code: string;
  meaning: string;
  positions: string;
  note?: string;
};

const ROWS: Row[] = [
  { step: 1, color: "#6b0000", code: "LK", meaning: "Dernier contrat", positions: "1-3", note: "À partir de 5 ticks d'écart" },
  { step: 2, color: "#e6231e", code: "AK", meaning: "Contrat actuel", positions: "1-3", note: "À partir de 5 ticks d'écart. Et lors d'un changement de contrat, à insérer une semaine plus tard seulement" },
  { step: 3, color: "#145214", code: "LM", meaning: "Dernier mois", positions: "1" },
  { step: 4, color: "#34d13a", code: "AM", meaning: "Mois actuel", positions: "1" },
  { step: 5, color: "#8ec9e8", code: "VLW", meaning: "Avant-dernière semaine", positions: "1" },
  { step: 6, color: "#1f4fd8", code: "LW", meaning: "Semaine dernière", positions: "1" },
  { step: 7, color: "#17d1e6", code: "AW", meaning: "Semaine actuelle", positions: "1", note: "Ajoutée seulement à partir de mercredi" },
  { step: 8, color: "#0f7a7a", code: "SLW", meaning: "Session de la semaine dernière", positions: "1", note: "À insérer tous les jours du lundi au vendredi" },
  { step: 9, color: "#1f3fd8", code: "VAH-P", meaning: "Value Area High P-Histogramme", positions: "1" },
  { step: 10, color: "#1f3fd8", code: "VAL-P", meaning: "Value Area Low P-Histogramme", positions: "1" },
  { step: 11, color: "#6a1b8a", code: "VAH-G", meaning: "Value Area High hier", positions: "1" },
  { step: 12, color: "#6a1b8a", code: "VAL-G", meaning: "Value Area Low hier", positions: "1" },
  { step: 13, color: "#e8790f", code: "HG", meaning: "High hier", positions: "1" },
  { step: 14, color: "#e8790f", code: "LG", meaning: "Low hier", positions: "1" },
  { step: 15, color: "#ffffff", code: "SG", meaning: "Session hier", positions: "1" },
  { step: 16, color: "#f5e400", code: "SH", meaning: "Session aujourd'hui", positions: "1" },
  { step: 17, color: "#6b6b6b", code: "SAW", meaning: "Session semaine actuelle", positions: "1", note: "Tous ceux de cette semaine" },
];

const cellStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  color: "oklch(0.85 0.01 290)",
  borderBottom: "1px solid oklch(0.3 0.02 290 / 0.6)",
};

const headStyle: CSSProperties = {
  ...cellStyle,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "oklch(0.62 0.02 290)",
  borderBottom: "1px solid oklch(0.35 0.02 290)",
};

export default function ColorCode() {
  return (
    <div style={{ ...glassCard, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.02 290 / 0.6)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e6231e" }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Le code couleur</div>
        <div style={{ fontSize: 11, color: "oklch(0.55 0.02 290)", marginLeft: "auto", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
          Mr. Volume Academy
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, textAlign: "left" }}>#</th>
              <th style={{ ...headStyle, textAlign: "left" }}>Couleur</th>
              <th style={{ ...headStyle, textAlign: "left" }}>Abrév.</th>
              <th style={{ ...headStyle, textAlign: "left" }}>Signification</th>
              <th style={{ ...headStyle, textAlign: "left" }}>Pos.</th>
              <th style={{ ...headStyle, textAlign: "left" }}>Remarque</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.step}>
                <td style={cellStyle}>{r.step}</td>
                <td style={cellStyle}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: r.color,
                      border: "1px solid oklch(0.4 0.02 290)",
                    }}
                  />
                </td>
                <td style={{ ...cellStyle, fontFamily: "var(--font-jetbrains-mono), monospace", fontWeight: 600 }}>{r.code}</td>
                <td style={cellStyle}>{r.meaning}</td>
                <td style={cellStyle}>{r.positions}</td>
                <td style={{ ...cellStyle, color: "oklch(0.62 0.02 290)" }}>{r.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
