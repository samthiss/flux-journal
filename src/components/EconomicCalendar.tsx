"use client";

import { accentColor, glassCard } from "@/lib/theme";

// Filters are pinned in the URL rather than left to the widget's own controls:
// countries: 5 United States, 72 Euro Zone, 22 France, 17 Germany, 4 United
// Kingdom, 12 Switzerland. timeZone=16 was confirmed empirically (Initial
// Jobless Claims — always released 8:30am US Eastern — showed as 14:30, the
// correct Paris/CEST time). All toggle controls (date picker, day/week/month
// tabs, filters) are dropped from "features" so the filters stay fixed for
// every visitor.
const INVESTING_CALENDAR_SRC =
  "https://sslecal2.investing.com/?ecoDayBackground=%23131722&columns=exc_flag,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&countries=5,72,22,17,4,12&importance=3&calType=day&timeZone=16&lang=1";
// Investing.com always renders its own logo + app-store badges as a fixed
// header (~64px) above the table; there's no URL flag to remove it, so we
// crop it by rendering the iframe taller than its visible wrapper and
// shifting it up. Nudge INVESTING_HEADER_CROP if the crop line is off.
const INVESTING_HEADER_CROP = 64;

/**
 * The economic calendar.
 *
 * `height` is a prop because the calendar is read differently depending on
 * where it sits: squeezed under the checklist it was a glance at the next
 * release, while on its own tab there is room to show the whole day without
 * scrolling inside a 360px window.
 */
/**
 * How wide the card is allowed to get.
 *
 * The widget's table has a natural width of its own and does not stretch, so
 * anything beyond it is white iframe background to the right of the last
 * column. 615px is where the table ended when measured on a rendered screenshot
 * — it cannot be read from the page itself, the iframe being cross-origin, and
 * investing.com answers 403 to anything that is not a browser.
 */
const CALENDAR_WIDTH = 620;

export default function EconomicCalendar({ height = 360 }: { height?: number }) {
  return (
    <div style={{ ...glassCard, padding: 0, overflow: "hidden", maxWidth: CALENDAR_WIDTH, marginInline: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Calendrier économique</div>
        <div style={{ fontSize: 11, color: "oklch(0.55 0.034 250)", marginLeft: "auto", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
          investing.com
        </div>
      </div>
      {/*
        The wrapper does not scroll. It used to hold an iframe made far taller
        than its content so nothing would be cut, but the length of the day's
        table cannot be known from here — so on a short day that surplus was
        hundreds of pixels of empty white that could still be scrolled through.

        The iframe is now exactly as tall as the visible area, plus the header
        being cropped off the top, so its bottom edge lands on the card's. When
        a day really is longer than that, the iframe scrolls on its own, which
        is the one case where a scrollbar means something.
      */}
      <div style={{ height, overflow: "hidden" }}>
        <iframe
          src={INVESTING_CALENDAR_SRC}
          title="Economic Calendar"
          width="100%"
          height={height + INVESTING_HEADER_CROP}
          frameBorder={0}
          allowTransparency
          style={{ display: "block", border: "none", marginTop: -INVESTING_HEADER_CROP }}
        />
      </div>
    </div>
  );
}
