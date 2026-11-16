"use client";

import { accentColor, glassCard, lossColor, winColor } from "@/lib/theme";
import { newsCurrencies } from "@/lib/contracts";
import { HOURS_WHY } from "@/components/DatabentoClient";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;
const DIM = "oklch(0.55 0 0)";

/** A pair's order hours in Chicago time: from the first to the last, less the excluded ones. */
export type Session = { symbol: string; hours: [number, number]; exclude: number[] };

/** The instant a Chicago hour falls at, on a given date. */
function chicagoInstant(day: string, hour: number) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const there = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(guess));
  return guess + ((hour - there + 24) % 24) * 3600000;
}

/** The Berlin date of an instant, YYYY-MM-DD. */
const clockDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(t);

const clock = (t: number, timeZone: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });

/**
 * The trading day, one row per pair: which hours each may take an order in,
 * on both clocks, and where a release blocks it. Apart from the news list, so
 * the two questions — what is published, when may I trade — are not mixed.
 *
 * The day is Berlin's, worked out with explicit time zones so the server and
 * the browser draw the same grid; a weekend shows the coming Monday.
 */
/** A release that blocks orders: the source's three stars, in a currency one of the pairs follows. */
export type Release = { at: string; currency: string; title: string; forecast: string; previous: string; actual: string };

export default function PairDay({ sessions, releases: all, ok, now }: { sessions: Session[]; releases: Release[]; ok: boolean; now: number }) {
  if (!sessions.length) return null;
  const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now) + "T12:00:00Z");
  const weekday = d.getUTCDay();
  if (weekday === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (weekday === 0) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });

  const first = Math.min(...sessions.map((s) => s.hours[0]));
  const last = Math.max(...sessions.map((s) => s.hours[1]));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const start = (h: number) => chicagoInstant(day, h);

  // The day's releases, from midnight to midnight in Berlin.
  const releases = all
    .map((r) => ({ ...r, t: new Date(r.at).getTime() }))
    .filter((r) => clockDay(r.t) === day)
    .sort((a, b) => a.t - b.t);
  const pairsFor = (currency: string) => sessions.filter((s) => newsCurrencies(s.symbol).includes(currency)).map((s) => s.symbol);

  const cols = `64px repeat(${hours.length}, minmax(34px, 1fr))`;
  const isNow = (h: number) => now >= start(h) && now < start(h + 1);

  return (
    <div style={{ ...glassCard, marginTop: 24, padding: "14px 18px", ...mono }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, background: accentColor, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.92 0 0)" }}>Horaires du jour</span>
        <span style={{ fontSize: 11, color: accentColor, textTransform: "uppercase" }}>{label}</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 2, minWidth: 64 + hours.length * 36, fontSize: 10.5 }}>
          <span style={{ color: DIM }}>CT</span>
          {hours.map((h) => (
            <span key={`ct${h}`} style={{ color: isNow(h) ? "#000" : accentColor, background: isNow(h) ? accentColor : "none", textAlign: "center" }}>
              {String(h).padStart(2, "0")}h
            </span>
          ))}
          <span style={{ color: DIM }}>BERLIN</span>
          {hours.map((h) => (
            <span key={`be${h}`} style={{ color: "oklch(0.8 0 0)", textAlign: "center" }}>
              {clock(start(h), "Europe/Berlin").slice(0, 2)}h
            </span>
          ))}

          {sessions.map((s) => {
            const blocks = releases.filter((r) => newsCurrencies(s.symbol).includes(r.currency));
            return [
              <span key={s.symbol} style={{ color: "oklch(0.92 0 0)", fontWeight: 700, fontSize: 12, alignSelf: "center" }}>
                {s.symbol}
              </span>,
              ...hours.map((h) => {
                const open = h >= s.hours[0] && h < s.hours[1] && !s.exclude.includes(h);
                const news = blocks.filter((r) => r.t + 600000 > start(h) && r.t - 600000 < start(h + 1));
                return (
                  <span
                    key={`${s.symbol}${h}`}
                    title={news.map((r) => `${clock(r.t, "Europe/Berlin")} Berlin · ${clock(r.t, "America/Chicago")} CT — ${r.currency} ${r.title} (±10 min)`).join("\n") || undefined}
                    style={{
                      height: 22,
                      background: open ? "oklch(0.77 0.18 152 / 0.28)" : "oklch(0.2 0 0)",
                      borderTop: `2px solid ${open ? winColor : "transparent"}`,
                      outline: isNow(h) ? `1px solid ${accentColor}` : "none",
                      color: lossColor,
                      fontWeight: 700,
                      textAlign: "center",
                      lineHeight: "20px",
                    }}
                  >
                    {news.length ? "N" : ""}
                  </span>
                );
              }),
            ];
          })}
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid #2E2E2E", paddingTop: 10 }}>
        <div style={{ fontSize: 10.5, color: DIM, letterSpacing: "0.12em", marginBottom: 6 }}>NEWS 3 ÉTOILES DU JOUR</div>
        {!ok && <div style={{ fontSize: 11.5, color: DIM }}>Le flux des news n&apos;a pas répondu — il sera relu dans l&apos;heure.</div>}
        {ok && releases.length === 0 && <div style={{ fontSize: 11.5, color: winColor }}>Aucune news qui bloque tes paires ce jour-là.</div>}
        {releases.map((r, i) => {
          const pairs = pairsFor(r.currency);
          return (
            <div key={`${r.at}${r.title}${i}`} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0", borderBottom: "1px solid oklch(0.26 0 0 / 0.5)", fontSize: 11.5 }}>
              <span style={{ flex: "none", width: 92, lineHeight: 1.3 }}>
                {clock(r.t, "Europe/Berlin")} <span style={{ fontSize: 9.5, color: DIM }}>BER</span>
                <br />
                <span style={{ color: accentColor }}>{clock(r.t, "America/Chicago")}</span> <span style={{ fontSize: 9.5, color: DIM }}>CT</span>
              </span>
              <span style={{ flex: "none", fontSize: 10, padding: "1px 7px", border: "1px solid oklch(0.34 0 0)", color: "oklch(0.7 0 0)" }}>{r.currency}</span>
              <span style={{ flex: 1, minWidth: 0, color: "oklch(0.88 0 0)" }}>
                {r.title}
                <span style={{ display: "block", fontSize: 10, marginTop: 2 }}>
                  <span style={{ color: "#000", background: lossColor, padding: "0 5px", marginRight: 6, fontWeight: 700 }}>
                    NE PAS TRADER {pairs.length === sessions.length ? "TOUTES TES PAIRES" : pairs.join(" · ")}
                  </span>
                  <span style={{ color: lossColor }}>
                    {clock(r.t - 600000, "Europe/Berlin")}–{clock(r.t + 600000, "Europe/Berlin")} Berlin · {clock(r.t - 600000, "America/Chicago")}–
                    {clock(r.t + 600000, "America/Chicago")} CT
                  </span>
                </span>
              </span>
              {(r.actual || r.forecast || r.previous) && (
                <span style={{ flex: "none", fontSize: 10.5, color: DIM, whiteSpace: "nowrap" }}>
                  {r.actual && <span style={{ color: accentColor, marginRight: 4 }}>{r.actual}</span>}
                  {r.forecast || "—"} <span style={{ opacity: 0.6 }}>/ {r.previous || "—"}</span>
                </span>
              )}
            </div>
          );
        })}
        {releases.length > 0 && <div style={{ fontSize: 10, color: DIM, marginTop: 6 }}>publié · prévision / précédent</div>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 10.5, color: "oklch(0.7 0 0)", marginTop: 12 }}>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 10, background: "oklch(0.77 0.18 152 / 0.28)", borderTop: `2px solid ${winColor}`, marginRight: 6, verticalAlign: "middle" }} />
          ordres permis
        </span>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 10, background: "oklch(0.2 0 0)", marginRight: 6, verticalAlign: "middle" }} />
          pas de nouvel ordre
        </span>
        <span>
          <span style={{ color: lossColor, fontWeight: 700, marginRight: 6 }}>N</span>
          news 3 étoiles (TradingView) : aucun ordre 10 min avant → 10 min après
        </span>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 10, outline: `1px solid ${accentColor}`, marginRight: 6, verticalAlign: "middle" }} />
          heure en cours
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: DIM, marginTop: 8, lineHeight: 1.6 }}>
        Un trade rempli avant une heure grise se gère jusqu&apos;au bout (SL, TP1, trailing, 4 h max). Fin des ordres à {String(last).padStart(2, "0")}h CT ·{" "}
        {clock(start(last), "Europe/Berlin")} Berlin.
        {sessions
          .filter((s) => HOURS_WHY[s.symbol])
          .map((s) => (
            <div key={s.symbol}>
              <span style={{ color: "oklch(0.85 0 0)" }}>{s.symbol}</span> · {HOURS_WHY[s.symbol]}
            </div>
          ))}
      </div>
    </div>
  );
}
