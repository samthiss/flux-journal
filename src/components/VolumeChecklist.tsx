"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { accentColor, glassCard } from "@/lib/theme";

type DayPlan = { title: string; intro?: string; steps: string[] };

// Weekday index matches Date.getDay() (0 = Sunday .. 6 = Saturday).
const DAILY_STEPS: Record<number, DayPlan> = {
  0: {
    title: "Dimanche",
    steps: [
      "Supprimer toutes les lignes et insérer « Nouveau » pour le marché concerné.",
      "Commencer par l'étape 1 du tableau de procédure.",
    ],
  },
  1: {
    title: "Lundi",
    steps: ["Commencer par l'étape 1 du tableau de procédure (voir mardi)."],
  },
  2: {
    title: "Mardi",
    intro:
      "C'est ici que la « Session actuelle » (jaune) est ajoutée – toutes les autres lignes ont déjà été insérées dimanche pour le marché concerné.",
    steps: [
      "La session de lundi (SH / jaune) est colorée en blanc et devient la session d'hier (SG / blanc), et la session d'aujourd'hui est ajoutée en jaune (SH).",
      "Mettre à jour et repositionner le Value Area Low et le Value Area High (VAL-P & VAH-P) du P-Histogramme.",
      "Mettre à jour et repositionner le Value Area Low et le Value Area High d'hier (VAL-G & VAH-G).",
      "Mettre à jour et repositionner le Low et le High d'hier (LG & HG).",
      "Vérifier que le contrat actuel et le volume mensuel dans le Volume Journal sont toujours corrects et à jour.",
    ],
  },
  3: {
    title: "Mercredi",
    steps: [
      "La ligne de session blanche (SG) est colorée en gris et devient une « Session » de la semaine actuelle (SAW).",
      "La session de mardi (SH / jaune) est colorée en blanc (SG), et la session d'aujourd'hui est ajoutée en jaune (SH).",
      "Mettre à jour et repositionner le VAL-P & VAH-P du P-Histogramme.",
      "Mettre à jour et repositionner le VAL-G & VAH-G d'hier.",
      "Mettre à jour et repositionner le LG & HG d'hier.",
      "Vérifier que le contrat actuel et le volume mensuel dans le Volume Journal sont toujours corrects et à jour.",
      "Aujourd'hui, ajouter la ligne d'analyse de la semaine actuelle (AW), car suffisamment de volume est désormais disponible pour que cette ligne soit pertinente.",
    ],
  },
  4: {
    title: "Jeudi",
    steps: [
      "La ligne de session blanche (SG) est colorée en gris et devient une « Session » de la semaine actuelle (SAW).",
      "La session de mercredi (SH / jaune) est colorée en blanc (SG), et la session d'aujourd'hui est ajoutée en jaune (SH).",
      "Mettre à jour et repositionner le VAL-P & VAH-P du P-Histogramme.",
      "Mettre à jour et repositionner le VAL-G & VAH-G d'hier.",
      "Mettre à jour et repositionner le LG & HG d'hier.",
      "Vérifier que le contrat actuel, le volume mensuel et la semaine actuelle dans le Volume Journal sont toujours corrects et à jour.",
    ],
  },
  5: {
    title: "Vendredi",
    steps: [
      "La ligne de session blanche (SG) est colorée en gris et devient une « Session » de la semaine actuelle (SAW).",
      "La session de jeudi (jaune) est colorée en blanc (SG), et la session d'aujourd'hui est ajoutée en jaune (SH).",
      "Mettre à jour et repositionner le VAL-P & VAH-P du P-Histogramme.",
      "Mettre à jour et repositionner le VAL-G & VAH-G d'hier.",
      "Mettre à jour et repositionner le LG & HG d'hier.",
      "Vérifier que le contrat actuel, le volume mensuel et la semaine actuelle dans le Volume Journal sont toujours corrects et à jour.",
    ],
  },
  6: {
    title: "Samedi",
    steps: [
      "Aujourd'hui, rien n'est modifié ni ajouté dans l'analyse – la préparation reprendra dimanche avec la suppression de toutes les lignes et la mise en place de la semaine à venir.",
    ],
  },
};

const DAY_ABBR: Record<number, string> = { 0: "Dim", 1: "Lun", 2: "Mar", 3: "Mer", 4: "Jeu", 5: "Ven", 6: "Sam" };

// Maps a weekday index to the date (within the current week, Sunday-anchored)
// so manually browsing to e.g. Friday's steps mid-week reuses the same
// storage slot Friday itself will use when it arrives.
function dateForDay(dayIndex: number): string {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  const target = new Date(sunday);
  target.setDate(sunday.getDate() + dayIndex);
  // "en-CA" formats as YYYY-MM-DD in the *local* timezone. toISOString() would
  // give UTC, which lags Paris by 1-2h, so between midnight and 02:00 local it
  // still reads as yesterday and would file those ticks under the wrong day.
  return target.toLocaleDateString("en-CA");
}

function storageKey(market: string, dateKey: string) {
  return `volumeChecklist:${market}:${dateKey}`;
}

const pillStyle = (active: boolean): CSSProperties => ({
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  background: active ? accentColor : "transparent",
  color: active ? "oklch(0.12 0.01 290)" : "oklch(0.7 0.02 290)",
  border: `1px solid ${active ? accentColor : "oklch(0.4 0.02 290)"}`,
});

export default function VolumeChecklist({ market }: { market: string }) {
  const [today, setToday] = useState<number | null>(null);
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);

  useEffect(() => {
    const dow = new Date().getDay();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial mount only, avoids SSR/client mismatch on Date.getDay()
    setToday(dow);
    setDayIndex(dow);
  }, []);

  useEffect(() => {
    if (dayIndex === null) return;
    const plan = DAILY_STEPS[dayIndex];
    const key = storageKey(market, dateForDay(dayIndex));
    let saved: boolean[] | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate checked state from localStorage for the selected market/day
    setChecked(saved && saved.length === plan.steps.length ? saved : plan.steps.map(() => false));
  }, [dayIndex, market]);

  if (dayIndex === null || today === null) return null;

  const plan = DAILY_STEPS[dayIndex];
  const doneCount = checked.filter(Boolean).length;

  function toggle(i: number) {
    setChecked((prev) => {
      const next = prev.map((v, idx) => (idx === i ? !v : v));
      try {
        window.localStorage.setItem(storageKey(market, dateForDay(dayIndex!)), JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  return (
    <div style={{ ...glassCard, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Mr. Volume Academy · {market}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(DAY_ABBR).map(([idx, label]) => (
            <button key={idx} onClick={() => setDayIndex(Number(idx))} style={pillStyle(Number(idx) === dayIndex)}>
              {label}
              {Number(idx) === today && (
                <span
                  style={{
                    display: "inline-block",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    marginLeft: 5,
                    background: Number(idx) === dayIndex ? "oklch(0.12 0.01 290)" : accentColor,
                    verticalAlign: "middle",
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Procédure quotidienne — {plan.title}</div>
        <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 14, color: accentColor }}>
          {doneCount} / {plan.steps.length}
        </div>
      </div>

      {plan.intro && (
        <div style={{ fontSize: 13, color: "oklch(0.68 0.02 290)", margin: "10px 0 16px", lineHeight: 1.5 }}>
          {plan.intro}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: plan.intro ? 0 : 16 }}>
        {plan.steps.map((step, i) => (
          <div
            key={i}
            onClick={() => toggle(i)}
            style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 8px", borderRadius: 8, cursor: "pointer" }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                flexShrink: 0,
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1.5px solid ${checked[i] ? accentColor : "oklch(0.42 0.02 290)"}`,
                background: checked[i] ? accentColor : "transparent",
              }}
            >
              {checked[i] && (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-6" fill="none" stroke="oklch(0.12 0.01 290)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: checked[i] ? "oklch(0.5 0.015 290)" : "oklch(0.88 0.01 290)",
                textDecoration: checked[i] ? "line-through" : "none",
              }}
            >
              {step}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
