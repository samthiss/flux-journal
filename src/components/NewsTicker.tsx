"use client";

import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
/** Where the reader's answer about alerts is kept. */
const ALERTES = "flux.news.alertes";

/**
 * How long before a release the warning goes out.
 *
 * Five minutes is what it takes to be flat, or to decide not to be — which is
 * the only reason to be told at all.
 */
const AVANT = 5;

/** The preference, as a store so every page carrying the band agrees on it. */
const ecouteurs = new Set<() => void>();
const alerteStore = {
  subscribe(listener: () => void) {
    ecouteurs.add(listener);
    return () => void ecouteurs.delete(listener);
  },
  lu: () => {
    try {
      return window.localStorage.getItem(ALERTES);
    } catch {
      return null;
    }
  },
  auServeur: (): string | null => null,
};

/** Turns them on, asking the browser at the moment the reader asks for them. */
async function basculerAlertes(actif: boolean) {
  let valeur = actif ? null : "1";
  if (!actif && typeof Notification !== "undefined" && Notification.permission !== "granted") {
    // Refused, or dismissed: the band keeps its own warning, which needs
    // nobody's permission.
    const reponse = await Notification.requestPermission();
    if (reponse !== "granted") valeur = null;
  }
  try {
    if (valeur) window.localStorage.setItem(ALERTES, valeur);
    else window.localStorage.removeItem(ALERTES);
  } catch {
    // Nothing to be done about it, and the session still holds the choice.
  }
  for (const ecouteur of ecouteurs) ecouteur();
}

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

  /**
   * Whether the browser should say it out loud.
   *
   * Off until asked for: a notification nobody agreed to is the kind of thing
   * that gets a page muted for good. The answer is remembered, and the
   * browser's permission is asked for at the click rather than on arrival.
   */
  const actif = useSyncExternalStore(alerteStore.subscribe, alerteStore.lu, alerteStore.auServeur) === "1";
  /** What the browser has already announced, so a release is said once. */
  const annonces = useRef<Set<string>>(new Set());
  /** What the reader has waved away, by the same keys. */
  const [ecartes, setEcartes] = useState<string[]>([]);

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

  /**
   * The release to put in front of the reader, if there is one.
   *
   * Derived rather than announced by a timer: what is on screen is a function
   * of the clock and of what has been waved away, so nothing has to be kept in
   * step. Twice per release — five minutes before, to be flat or to decide not
   * to be, and at the moment it lands.
   */
  const alerte = (() => {
    if (minute === null) return null;
    const instant = minute * 60_000;
    for (const event of duJour) {
      if (!event.at) continue;
      const t = new Date(event.at).getTime();
      const cle = `${event.currency}|${event.title}|${event.at}`;
      const bientot = instant >= t - AVANT * 60_000 && instant < t;
      const tombe = instant >= t && instant < t + 2 * 60_000;
      if (!bientot && !tombe) continue;
      const moment = bientot ? ("bientot" as const) : ("maintenant" as const);
      if (ecartes.includes(`${cle}|${moment}`)) continue;
      return { event, moment, cle: `${cle}|${moment}`, minutes: Math.max(0, Math.round((t - instant) / 60_000)) };
    }
    return null;
  })();

  /**
   * The same warning, said by the browser.
   *
   * Only where it was asked for, and only once per release per moment — the
   * ref is what keeps a re-render from announcing it again. It is the half
   * that works when the journal is not the tab being looked at, which is most
   * of the time during a session.
   */
  useEffect(() => {
    if (!alerte || !actif) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (annonces.current.has(alerte.cle)) return;
    annonces.current.add(alerte.cle);
    const titre =
      alerte.moment === "bientot"
        ? `Dans ${alerte.minutes || 1} min · ${alerte.event.currency}`
        : `Maintenant · ${alerte.event.currency}`;
    try {
      new Notification(titre, { body: alerte.event.title, tag: alerte.cle, icon: "/favicon.ico" });
    } catch {
      // A browser that refuses to build one is not a reason to break the page.
    }
  }, [alerte, actif]);

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
        {/* The browser's own warning, off until it is asked for. The popup
            below needs nobody's permission; this is the half that reaches a
            tab nobody is looking at. */}
        <span
          onClick={() => void basculerAlertes(actif)}
          title={
            actif
              ? "Notifications du navigateur : activées — cliquer pour les couper"
              : "Prévenir aussi hors de cet onglet, 5 min avant chaque publication"
          }
          style={{
            cursor: "pointer",
            marginLeft: 2,
            padding: "2px 8px",
            borderRadius: 999,
            border: `1px ${actif ? "solid" : "dashed"} ${actif ? newsColor : "oklch(0.45 0.03 75)"}`,
            color: actif ? newsColor : "oklch(0.6 0.03 75)",
            letterSpacing: "0.08em",
          }}
        >
          {actif ? "alertes ●" : "alertes ○"}
        </span>
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

      {/* Put in front of the reader rather than left to travel past: five
          minutes before a release, and again as it lands. It is drawn into the
          body so no card's cut corners can clip it, and it goes when it is
          waved away or when its two minutes are up. */}
      {alerte &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: 24,
              right: 24,
              zIndex: 500,
              width: 320,
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${newsColor.replace(")", " / 0.65)")}`,
              background: "linear-gradient(oklch(0.26 0.08 75 / 0.97), oklch(0.2 0.06 75 / 0.97))",
              boxShadow: `0 18px 44px -12px oklch(0 0 0 / 0.75), 0 0 30px -8px ${newsColor.replace(")", " / 0.5)")}`,
              fontFamily: "var(--font-jetbrains-mono), monospace",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: newsColor }}>
              <span
                className="news-alert-dot"
                style={{ width: 8, height: 8, borderRadius: "50%", background: newsColor, boxShadow: `0 0 10px ${newsColor}` }}
              />
              {alerte.moment === "bientot" ? `Dans ${alerte.minutes || 1} min` : "Maintenant"}
              <span style={{ marginLeft: "auto", color: "oklch(0.7 0.03 75)" }}>{alerte.event.currency}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: "oklch(0.97 0.01 250)", whiteSpace: "normal" }}>
              {alerte.event.title}
            </div>
            {(alerte.event.forecast || alerte.event.previous) && (
              <div style={{ marginTop: 4, fontSize: 11, color: "oklch(0.72 0.03 75)" }}>
                {alerte.event.forecast ? `prév. ${alerte.event.forecast}` : ""}
                {alerte.event.forecast && alerte.event.previous ? " · " : ""}
                {alerte.event.previous ? `préc. ${alerte.event.previous}` : ""}
              </div>
            )}
            <div
              onClick={() => setEcartes((prev) => [...prev, alerte.cle])}
              style={{
                marginTop: 12,
                textAlign: "center",
                padding: "6px 0",
                borderRadius: 7,
                cursor: "pointer",
                fontSize: 11,
                border: `1px solid ${newsColor.replace(")", " / 0.5)")}`,
                color: newsColor,
              }}
            >
              compris
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
