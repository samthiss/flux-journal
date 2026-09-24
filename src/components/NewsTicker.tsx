"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { EconomicEvent } from "@/lib/economicCalendar";
import { currenciesOf, focusFor, underFocus } from "@/lib/marketFocus";
import { marketStore } from "@/lib/markets";
import { lossColor, newsColor } from "@/lib/theme";

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
export default function NewsTicker({ events, notees = [] }: { events: EconomicEvent[]; notees?: string[] }) {
  const pathname = usePathname();
  const [survol, setSurvol] = useState(false);
  const minute = useSyncExternalStore(horloge.subscribe, horloge.maintenant, horloge.auServeur);
  // The contract being read, chosen on the checklist. The band shows what that
  // market shows, or it is a second calendar disagreeing with the first.
  const marche = useSyncExternalStore(marketStore.subscribe, marketStore.lu, marketStore.auServeur);

  const duJour = useMemo(() => {
    if (minute === null) return [];
    const aujourdhui = new Date(minute * 60_000).toLocaleDateString("en-CA");
    /**
     * What this market makes of the calendar, exactly as the calendar tab
     * applies it: its own economies, and every release held to what it is
     * worth here — a Chinese print explains nothing about sterling, and a
     * summit is not a payrolls number on any contract.
     */
    const focus = marche ? focusFor(marche) : null;
    const devises = focus ? currenciesOf(focus) : null;
    /**
     * The releases the reader has rated themselves.
     *
     * Their star wins over the market's ceiling. The ceiling is a default for
     * what nobody has judged — what a category is generally worth on this
     * contract — and reading it over a star that was actually clicked is how
     * the band ended up announcing a summit while the calendar was showing
     * the two releases the reader had marked.
     */
    const juges = new Set(notees);
    return events
      // An entry with no clock — a closed session, a summit — is filed under a
      // day, and a day needs no timezone. One with a clock is placed by the
      // instant, read here in the reader's own time.
      .filter((e) => (e.at ? new Date(e.at).toLocaleDateString("en-CA") : e.date) === aujourdhui)
      .filter((e) => !devises || devises.includes(e.currency))
      .map((e) => (focus && !juges.has(`${e.currency}|${e.title}`) ? { ...e, impact: underFocus(e, focus) } : e))
      // Three stars, and the closed sessions. A band carrying the whole day
      // carried sixty rows and took seven minutes to come round — by which
      // time it is not news. What is left is what a trading day is planned
      // around: the releases that move a price, and the markets that are shut.
      .filter((e) => e.impact === "high" || e.kind === "holiday")
      // What has no hour comes first: it is true of the whole day.
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  }, [events, minute, marche, notees]);

  // The login screen inherits the layout, and the day's releases are not for
  // someone who has not signed in.
  if (pathname === "/login" || minute === null || duJour.length === 0) return null;

  const maintenant = minute * 60_000;
  // Long lists scroll slower, so the band moves at one speed whatever the day
  // holds: about seven seconds per release.
  const duree = Math.max(24, duJour.length * 7);

  const bande = duJour.map((event, i) => {
    const instant = event.at ? new Date(event.at) : null;
    const passe = instant ? instant.getTime() < maintenant : false;
    const etoiles = event.impact === "high" ? 3 : event.impact === "medium" ? 2 : 1;
    const ferme = event.kind === "holiday";
    return (
      <span
        key={`${event.currency}-${event.title}-${event.at}-${i}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginRight: 34,
          // What is already out is read for its figure; what is coming is read
          // for its hour, and that is the half worth keeping lit.
          opacity: passe ? 0.45 : 1,
        }}
      >
        <span style={{ color: "oklch(0.6 0.02 250)" }}>
          {/* No hour where the source gives none: a day-long entry shown at an
              hour reads as a release nobody scheduled. */}
          {instant ? instant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "journée"}
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
        <span style={{ color: ferme ? lossColor : newsColor, letterSpacing: "1px", fontSize: 12 }}>
          {ferme ? "●" : "★".repeat(etoiles)}
        </span>
        <span style={{ color: "oklch(0.95 0.01 250)", fontWeight: 500 }}>{event.title}</span>
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
        padding: "12px 0",
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 12.5,
        // Lit in amber rather than left dark: a band nobody notices is a band
        // that may as well not run. Dark enough underneath to stay behind the
        // page, bright enough at its edges to be the first thing read.
        background: "linear-gradient(oklch(0.24 0.07 75 / 0.92), oklch(0.19 0.05 75 / 0.92))",
        backdropFilter: "blur(6px)",
        borderBottom: `1px solid ${newsColor.replace(")", " / 0.45)")}`,
        boxShadow: `0 0 26px -6px ${newsColor.replace(")", " / 0.4)")}`,
      }}
    >
      {/* A label that does not travel, so the band says what it is even when
          the release passing through it is halfway out of view. */}
      <span
        className="news-ticker-label"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 1,
          paddingRight: 22,
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: newsColor,
          background: "linear-gradient(to right, oklch(0.22 0.07 75) 72%, oklch(0.22 0.07 75 / 0))",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: newsColor, boxShadow: `0 0 8px ${newsColor}` }} />
        News du jour
      </span>
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
        {/* Started clear of the label, so the first release is not read
            through it. */}
        <span style={{ display: "inline-flex", alignItems: "center" }}>{bande}</span>
        <span aria-hidden style={{ display: "inline-flex", alignItems: "center" }}>
          {bande}
        </span>
      </div>
    </div>
  );
}
