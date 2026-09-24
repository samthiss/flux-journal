"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { EconomicEvent } from "@/lib/economicCalendar";
import { accentColor, lossColor } from "@/lib/theme";

/**
 * The current minute, as a store rather than a clock read while rendering.
 *
 * Two things fall out of it. The server has no clock the reader would accept —
 * Railway is in UTC — so it returns nothing there and the band is drawn once
 * the browser takes over, which is also what keeps the markup from
 * disagreeing at hydration. And the minute ticking is what dims a release as
 * it comes out, without anything else asking for a re-render.
 */
const horloge = {
  subscribe(listener: () => void) {
    const id = setInterval(listener, 30_000);
    return () => clearInterval(id);
  },
  maintenant: () => Math.floor(Date.now() / 60_000),
  auServeur: () => null,
};

/**
 * The day's releases, scrolling across the top of every page.
 *
 * Nothing is typed in: these are the rows the economic calendar already reads
 * — the same source, the same hourly cache — so the band says what the tab
 * says without being kept up to date by hand.
 *
 * The day is the reader's, not the server's. Railway runs in UTC, so the
 * window handed down is three days wide and the browser keeps the one it is
 * actually living in; a band that turns over at 2am would be worse than none.
 */
export default function NewsTicker({ events }: { events: EconomicEvent[] }) {
  const pathname = usePathname();
  const [survol, setSurvol] = useState(false);
  const minute = useSyncExternalStore(horloge.subscribe, horloge.maintenant, horloge.auServeur);

  const duJour = useMemo(() => {
    if (minute === null) return [];
    const aujourdhui = new Date(minute * 60_000).toLocaleDateString("en-CA");
    return events
      .filter((e) => e.at && new Date(e.at).toLocaleDateString("en-CA") === aujourdhui)
      // Three stars, and the closed sessions. A band carrying the whole day
      // carried sixty rows and took seven minutes to come round — by which
      // time it is not news. What is left is what a trading day is planned
      // around: the releases that move a price, and the markets that are shut.
      .filter((e) => e.impact === "high" || e.kind === "holiday")
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  }, [events, minute]);

  // The login screen inherits the layout, and the day's releases are not for
  // someone who has not signed in.
  if (pathname === "/login" || minute === null || duJour.length === 0) return null;

  const maintenant = minute * 60_000;
  // Long lists scroll slower, so the band moves at one speed whatever the day
  // holds: about seven seconds per release.
  const duree = Math.max(24, duJour.length * 7);

  const bande = duJour.map((event, i) => {
    const instant = new Date(event.at!);
    const passe = instant.getTime() < maintenant;
    const etoiles = event.impact === "high" ? 3 : event.impact === "medium" ? 2 : 1;
    const ferme = event.kind === "holiday";
    return (
      <span
        key={`${event.currency}-${event.title}-${event.at}-${i}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          marginRight: 28,
          // What is already out is read for its figure; what is coming is read
          // for its hour, and that is the half worth keeping lit.
          opacity: passe ? 0.45 : 1,
        }}
      >
        <span style={{ color: "oklch(0.6 0.02 250)" }}>
          {instant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span
          style={{
            padding: "1px 6px",
            borderRadius: 999,
            border: "1px solid oklch(0.34 0.034 250)",
            color: "oklch(0.78 0.02 250)",
            fontSize: 9.5,
          }}
        >
          {event.currency}
        </span>
        <span style={{ color: ferme ? lossColor : accentColor, letterSpacing: "0.5px" }}>
          {ferme ? "●" : "★".repeat(etoiles)}
        </span>
        <span style={{ color: "oklch(0.88 0.017 250)" }}>{event.title}</span>
        {/* The figure once it is out, against what was expected of it: a band
            that only ever announced releases would be worth reading once. */}
        {event.actual ? (
          <span style={{ color: "oklch(0.75 0.02 250)" }}>
            {event.actual}
            {event.forecast ? <span style={{ color: "oklch(0.5 0.02 250)" }}> / {event.forecast}</span> : null}
          </span>
        ) : event.forecast ? (
          <span style={{ color: "oklch(0.5 0.02 250)" }}>prév. {event.forecast}</span>
        ) : null}
      </span>
    );
  });

  return (
    <div
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      className="news-ticker"
      title="Publications du jour — le calendrier complet est dans Checklist & News"
      style={{
        // Pinned to the top of the page it scrolls with, so it is still there
        // once the reader is three screens down a note. The inset that makes
        // it land flush is in the stylesheet, beside the padding it answers.
        position: "sticky",
        zIndex: 20,
        padding: "7px 0",
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 11,
        background: "oklch(0.15 0.03 250 / 0.92)",
        backdropFilter: "blur(6px)",
        borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)",
      }}
    >
      <div
        className="news-ticker-rail"
        style={{
          display: "inline-flex",
          alignItems: "center",
          animationDuration: `${duree}s`,
          animationPlayState: survol ? "paused" : "running",
        }}
      >
        {/* Twice, so the second copy is already in view when the first leaves:
            one copy would cross an empty band on its way back. */}
        <span style={{ display: "inline-flex", alignItems: "center", paddingLeft: 48 }}>{bande}</span>
        <span aria-hidden style={{ display: "inline-flex", alignItems: "center", paddingLeft: 48 }}>
          {bande}
        </span>
      </div>
    </div>
  );
}
