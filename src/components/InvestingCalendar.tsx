"use client";

import { accentColor, glassCard } from "@/lib/theme";

/**
 * The investing.com calendar, framed as it was before the journal drew its own.
 *
 * It may well show nothing. investing.com answers 403 to anything that is not
 * a browser and sends `x-frame-options: SAMEORIGIN`, which is a refusal to be
 * framed by anyone but itself — checked again the day this came back, with the
 * URL below and a browser's own user agent. That is why it was replaced in the
 * first place; it is here because the reader asked for it back knowing the card
 * may stay blank. The journal's own calendar sits underneath it, so a blank
 * rectangle costs nothing but the space it takes.
 *
 * Filters are pinned in the URL rather than left to the widget's controls:
 * countries 5 United States, 72 Euro Zone, 17 Germany, 22 France, 4 United
 * Kingdom — the economies behind 6E and 6B — and importance=3, the three-star
 * releases those two futures are traded around. timeZone=16 is Paris, confirmed
 * empirically back then: Initial Jobless Claims, always 8:30am New York, showed
 * as 14:30. Every toggle is dropped from the widget's own controls so what is
 * shown cannot drift from what was asked for.
 */
const INVESTING_CALENDAR_SRC =
  "https://sslecal2.investing.com/?ecoDayBackground=%23131722&columns=exc_flag,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&countries=5,72,17,22,4&importance=3&calType=week&timeZone=16&lang=1";

/**
 * investing.com renders its own logo and app-store badges as a fixed header
 * above the table, and there is no URL flag to remove it: the iframe is drawn
 * taller than its window and shifted up by that much.
 */
const INVESTING_HEADER_CROP = 64;

/**
 * How wide the card may get.
 *
 * The widget's table has a natural width and does not stretch, so anything
 * past it is white iframe to the right of the last column.
 */
const CALENDAR_WIDTH = 620;

export default function InvestingCalendar({ height = 420 }: { height?: number }) {
  return (
    <div style={{ ...glassCard, padding: 0, overflow: "hidden", maxWidth: CALENDAR_WIDTH, marginInline: "auto", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Calendrier économique</div>
        <div style={{ fontSize: 11, color: "oklch(0.55 0.034 250)", marginLeft: "auto", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
          investing.com · 3 étoiles
        </div>
      </div>
      {/*
        The window does not scroll: the iframe is exactly as tall as the visible
        area plus the cropped header, so its bottom edge lands on the card's.
        A week longer than that scrolls inside the widget itself, which is the
        one case where a scrollbar means something.
      */}
      <div style={{ height, overflow: "hidden" }}>
        <iframe
          src={INVESTING_CALENDAR_SRC}
          title="Calendrier économique investing.com"
          width="100%"
          height={height + INVESTING_HEADER_CROP}
          frameBorder={0}
          style={{ display: "block", border: "none", marginTop: -INVESTING_HEADER_CROP }}
        />
      </div>
    </div>
  );
}
