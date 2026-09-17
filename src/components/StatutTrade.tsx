"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { accentColor, lossColor } from "@/lib/theme";


/**
 * Where a trade stands: planned, being traded, closed.
 *
 * Drawn rather than left to a `<select>`. The browser's own list is a grey
 * rectangle with a system arrow, which on this page sat between hand-drawn
 * chips and looked like something the journal had failed to style — and it
 * could say nothing about the three states it held. Here each one has its own
 * colour and a dot: dim while it is only a plan, lit while the position is on,
 * hollow once it is over.
 */

const ETATS = [
  { valeur: "plan", texte: "Trading plan", couleur: "oklch(0.62 0.02 250)" },
  { valeur: "position", texte: "Trading", couleur: accentColor },
  { valeur: "closed", texte: "Position closed", couleur: lossColor },
] as const;

export type StatutValeur = (typeof ETATS)[number]["valeur"];

export default function StatutTrade({
  statut,
  onChange,
  compact = false,
}: {
  statut: string;
  onChange: (valeur: StatutValeur) => void;
  /** Smaller, for the row of a card rather than a list of positions. */
  compact?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  /** Where to draw the menu, read off the pill when it opens. */
  const [ancre, setAncre] = useState<{ top: number; left: number } | null>(null);
  const boite = useRef<HTMLDivElement>(null);
  const pilule = useRef<HTMLSpanElement>(null);
  /**
   * The menu is drawn into the body rather than beside the pill.
   *
   * The card it sits on has cut corners, and `clip-path` clips whatever
   * overflows: opened in place, the list was sliced off at the edge of the
   * card. Fixed to the viewport instead, and closed on a scroll, since a menu
   * pinned to the screen would otherwise drift away from its button.
   */
  useEffect(() => {
    if (!ouvert) return;
    const fermer = () => setOuvert(false);
    // Dismissed by a press outside the pill *and* outside the menu: the menu
    // is no longer inside the pill's wrapper, and a press on the pill must
    // close what it opened rather than close-then-reopen.
    const dehors = (event: PointerEvent) => {
      const cible = event.target as Node;
      if (boite.current?.contains(cible) || pilule.current?.contains(cible)) return;
      fermer();
    };
    const touche = (event: KeyboardEvent) => {
      if (event.key === "Escape") fermer();
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", touche);
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", touche);
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [ouvert]);

  function basculer() {
    const r = pilule.current?.getBoundingClientRect();
    if (r) setAncre({ top: r.bottom + 4, left: r.left });
    setOuvert((o) => !o);
  }

  const courant = ETATS.find((e) => e.valeur === statut) ?? ETATS[0];
  const enCours = courant.valeur === "position";

  return (
    // A flex box rather than a block: as an inline child the pill sat on a
    // text baseline, which pushed it a few pixels below the chips beside it.
    <div style={{ position: "relative", flex: "none", display: "inline-flex" }}>
      <span
        ref={pilule}
        onClick={basculer}
        title="Où en est ce trade"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-jetbrains-mono), monospace",
          // Compact matches the chips it sits beside — the direction, the
          // setup, the tags — so the row reads as one line rather than as a
          // control dropped into it.
          fontSize: compact ? 10 : 10.5,
          lineHeight: compact ? "14px" : undefined,
          padding: compact ? "2px 9px" : "5px 12px",
          borderRadius: 999,
          cursor: "pointer",
          whiteSpace: "nowrap",
          border: `1px ${courant.valeur === "plan" ? "dashed" : "solid"} ${
            courant.valeur === "plan" ? "oklch(0.34 0.02 250)" : courant.couleur.replace(")", " / 0.55)")
          }`,
          background: courant.valeur === "plan" ? "transparent" : courant.couleur.replace(")", " / 0.12)"),
          color: courant.couleur,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flex: "none",
            // Lit while the position is on, hollow once it is over: the state
            // that needs watching is the one that is still running.
            background: enCours ? courant.couleur : "transparent",
            border: `1px solid ${courant.couleur}`,
            boxShadow: enCours ? `0 0 6px ${courant.couleur}` : "none",
          }}
        />
        {courant.texte}
        <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
      </span>

      {ouvert && ancre && createPortal(
        <div
          ref={boite}
          style={{
            position: "fixed",
            top: ancre.top,
            left: ancre.left,
            zIndex: 400,
            minWidth: 150,
            padding: 4,
            borderRadius: 8,
            border: "1px solid oklch(0.32 0.034 250)",
            background: "oklch(0.17 0.03 250)",
            boxShadow: "0 8px 24px oklch(0.08 0.02 250 / 0.6)",
          }}
        >
          {ETATS.map((etat) => (
            <div
              key={etat.valeur}
              onClick={() => {
                setOuvert(false);
                if (etat.valeur !== courant.valeur) onChange(etat.valeur);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: 10.5,
                color: etat.valeur === courant.valeur ? etat.couleur : "oklch(0.72 0.02 250)",
                background: etat.valeur === courant.valeur ? etat.couleur.replace(")", " / 0.1)") : "transparent",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flex: "none",
                  background: etat.valeur === courant.valeur ? etat.couleur : "transparent",
                  border: `1px solid ${etat.couleur.replace(")", " / 0.7)")}`,
                }}
              />
              {etat.texte}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
