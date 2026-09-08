"use client";

import { useMemo } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import type { EconomicEvent } from "@/lib/economicCalendar";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/** Local YYYY-MM-DD for an instant, in the reader's own timezone. */
function localDay(event: EconomicEvent) {
  return event.at ? new Date(event.at).toLocaleDateString("en-CA") : event.date;
}

function localTime(event: EconomicEvent) {
  return event.at
    ? new Date(event.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;
}

function dayLabel(day: string) {
  const today = new Date().toLocaleDateString("en-CA");
  if (day === today) return "Aujourd'hui";
  // Midday, so a timezone shift cannot move the date across midnight.
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** Three bars, lit as far as the release matters. */
function Impact({ level }: { level: EconomicEvent["impact"] }) {
  const lit = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const colour = level === "high" ? lossColor : level === "medium" ? accentColor : "oklch(0.45 0.02 250)";
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "flex-end", flex: "none", height: 12 }}>
      {[5, 8, 11].map((h, i) => (
        <span
          key={h}
          style={{
            width: 3,
            height: h,
            background: i < lit ? colour : "oklch(0.3 0.02 250)",
            boxShadow: i < lit ? `0 0 6px -1px ${colour}` : "none",
          }}
        />
      ))}
    </span>
  );
}

/**
 * The week's releases, drawn by the journal itself.
 *
 * It used to be an investing.com iframe, which showed a white page inside a
 * dark app on a good day and nothing at all on a normal one: that widget
 * refuses to be framed. The feed behind this one is plain XML, so the rows can
 * be drawn like everything else here — and the times can be moved to the
 * reader's clock rather than left in whatever zone the widget assumed.
 */
export default function EconomicCalendar({
  events,
  ok,
  days = 3,
}: {
  events: EconomicEvent[];
  ok: boolean;
  /** How many days forward to show, today included. */
  days?: number;
}) {
  const grouped = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA");
    const byDay = new Map<string, EconomicEvent[]>();
    for (const event of events) {
      if (event.impact === "low") continue;
      const day = localDay(event);
      if (day < today) continue;
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(event);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, days);
  }, [events, days]);

  return (
    <div style={{ ...glassCard, padding: 0, maxWidth: 620, marginInline: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Calendrier économique</div>
        <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.034 250)", marginLeft: "auto" }}>forexfactory</div>
      </div>

      {!ok && (
        <div style={{ padding: "16px 18px", fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
          Le flux n&apos;a pas répondu — il limite les appels rapprochés. Il sera relu dans l&apos;heure.
        </div>
      )}
      {ok && grouped.length === 0 && (
        <div style={{ padding: "16px 18px", fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
          Aucune publication notable d&apos;ici la fin de la semaine.
        </div>
      )}

      {grouped.map(([day, rows]) => (
        <div key={day}>
          <div
            style={{
              ...mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: day === new Date().toLocaleDateString("en-CA") ? accentColor : "oklch(0.5 0.03 250)",
              padding: "10px 18px 6px",
              borderBottom: "1px solid oklch(0.28 0.03 250 / 0.5)",
            }}
          >
            {dayLabel(day)}
          </div>
          {rows.map((event, i) => (
            <div
              key={`${event.title}-${event.at ?? i}`}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "8px 18px",
                borderBottom: "1px solid oklch(0.26 0.03 250 / 0.35)",
              }}
            >
              <span style={{ ...mono, fontSize: 11.5, color: "oklch(0.72 0.02 250)", flex: "none", width: 44 }}>
                {localTime(event) ?? "—"}
              </span>
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  flex: "none",
                  padding: "1px 7px",
                  borderRadius: 999,
                  border: "1px solid oklch(0.34 0.02 250)",
                  color: "oklch(0.7 0.02 250)",
                }}
              >
                {event.currency}
              </span>
              <Impact level={event.impact} />
              <span style={{ fontSize: 12.5, color: "oklch(0.85 0.017 250)", flex: 1, minWidth: 0 }}>{event.title}</span>
              {(event.forecast || event.previous) && (
                <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.55 0.02 250)", flex: "none", whiteSpace: "nowrap" }}>
                  {event.forecast || "—"} <span style={{ opacity: 0.5 }}>/ {event.previous || "—"}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ ...mono, fontSize: 9.5, color: "oklch(0.45 0.02 250)", padding: "8px 18px" }}>
        prévision / précédent · heures locales
      </div>
    </div>
  );
}
