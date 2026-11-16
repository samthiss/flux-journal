"use client";

import { PageTitle } from "@/components/NeonText";
import PairDay, { type Release, type Session } from "@/components/PairDay";
import Reminders from "@/components/Reminders";

/**
 * The news page: the day's order hours for each pair, with the releases that
 * block them.
 *
 * The week's calendar that sat above it was taken off: what is read in the
 * morning is when each pair may be traded today, and the news are part of
 * that answer rather than a second list beside it.
 */
export default function ChecklistTabs({
  releases,
  calendarOk,
  sessions,
  open,
  now,
}: {
  releases: Release[];
  calendarOk: boolean;
  sessions: Session[];
  /** The trades on, whose four hours are being counted. */
  open: { id: string; symbol: string; filledAt: string }[];
  /** When the page was read: the day the grid shows. */
  now: number;
}) {
  return (
    <div>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <PageTitle>News</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0 0)", marginTop: 4 }}>
          Quand trader chaque paire aujourd&apos;hui, et les news qui bloquent tes ordres
        </div>
      </div>
      <Reminders pairs={sessions.map((s) => s.symbol)} open={open} now={now} />
      <PairDay sessions={sessions} releases={releases} ok={calendarOk} now={now} />
    </div>
  );
}
