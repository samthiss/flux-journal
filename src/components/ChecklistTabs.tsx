"use client";

import { PageTitle } from "@/components/NeonText";
import EconomicCalendar, { type Session } from "@/components/EconomicCalendar";
import type { EconomicEvent } from "@/lib/economicCalendar";

/**
 * The news page: the week's releases, each one saying which of the plan's
 * pairs it concerns and whether it blocks an order.
 *
 * The checklists that used to share this page — volume lines, pre-market,
 * trading plan, mindset, post-market — were taken off it, and with them the
 * market picker that filtered the calendar: every release now names its pairs.
 */
export default function ChecklistTabs({
  events,
  calendarOk,
  calendarSource,
  pairs,
  blackout,
  sessions,
}: {
  events: EconomicEvent[];
  calendarOk: boolean;
  calendarSource: string;
  pairs: string[];
  blackout: string[];
  sessions: Session[];
}) {
  return (
    <div>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <PageTitle>News</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0 0)", marginTop: 4 }}>
          Publications de la semaine — pour chacune, les paires concernées et si elle bloque tes ordres
        </div>
      </div>
      <EconomicCalendar events={events} ok={calendarOk} source={calendarSource} market="" pairs={pairs} blackout={blackout} sessions={sessions} />
    </div>
  );
}
