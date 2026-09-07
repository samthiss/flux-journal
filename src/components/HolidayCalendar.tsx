"use client";

import { useMemo } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { upcomingHolidays } from "@/lib/holidays";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/** Local YYYY-MM-DD, the way the rest of the checklist keys its day. */
function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function formatDay(day: string) {
  // Midday, so a timezone shift cannot move the date across midnight.
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * The days the market is shut, or thin.
 *
 * It sits beside the economic calendar because it answers the same question —
 * when not to trade — and the widget above does not: a holiday has no release
 * to list, so a closed day shows there as an empty page rather than as a closed
 * day. The dates are computed here from the rules that define them, so nothing
 * has to be maintained year to year.
 */
export default function HolidayCalendar({ count = 6 }: { count?: number }) {
  const today = todayKey();
  const days = useMemo(() => upcomingHolidays(today, count), [today, count]);
  const todayEntry = days.find((d) => d.day === today);

  return (
    <div style={{ ...glassCard, padding: 0, maxWidth: 620, marginInline: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Jours fériés</div>
        <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.034 250)", marginLeft: "auto" }}>
          US · zone euro · UK · Suisse
        </div>
      </div>

      {todayEntry && (
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)",
            background: todayEntry.closesCme ? "oklch(0.72 0.27 340 / 0.12)" : "oklch(0.84 0.17 196 / 0.08)",
          }}
        >
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", color: todayEntry.closesCme ? lossColor : accentColor }}>
            AUJOURD&apos;HUI{todayEntry.closesCme ? " — CME FERMÉ" : " — SÉANCE ALLÉGÉE"}
          </span>
          <div style={{ fontSize: 13, color: "oklch(0.88 0.017 250)", marginTop: 4 }}>
            {todayEntry.entries.map((e) => `${e.place} : ${e.name}`).join(" · ")}
          </div>
        </div>
      )}

      <div style={{ padding: "6px 0" }}>
        {days
          .filter((d) => d.day !== today)
          .map((d) => (
            <div
              key={d.day}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                padding: "9px 18px",
              }}
            >
              <span style={{ ...mono, fontSize: 11.5, color: "oklch(0.7 0.02 250)", flex: "none", width: 150 }}>
                {formatDay(d.day)}
              </span>
              {d.closesCme && (
                <span
                  style={{
                    ...mono,
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    flex: "none",
                    padding: "2px 7px",
                    borderRadius: 999,
                    border: `1px solid ${lossColor}`,
                    color: lossColor,
                  }}
                >
                  CME FERMÉ
                </span>
              )}
              <span style={{ fontSize: 12.5, color: "oklch(0.62 0.02 250)", minWidth: 0 }}>
                {d.entries.map((e) => `${e.place} : ${e.name}`).join(" · ")}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
