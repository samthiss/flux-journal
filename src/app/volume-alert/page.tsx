import { getAlertHours } from "@/lib/actions/volumeAlerts";
import { getAlertDays } from "@/lib/actions/volumeAlertDays";
import { getEventRatings } from "@/lib/actions/eventRatings";
import { applyRatings, getEventsOver } from "@/lib/economicCalendar";
import VolumeAlertTabs from "@/components/VolumeAlertTabs";
import { PageTitle } from "@/components/NeonText";

export const dynamic = "force-dynamic";

export default async function VolumeAlertPage() {
  const [hours, days] = await Promise.all([getAlertHours(), getAlertDays()]);

  /**
   * The releases that fell on the days the logbook covers.
   *
   * Read here and turned into a wall clock in the browser: the recorded hour
   * is the reader's own clock, and this server runs in UTC. Only the instant
   * and the name travel — what an hour needs to know is whether a figure came
   * out in it, and which.
   *
   * Rated the way the checklist rates them, so a release the reader has
   * re-rated by hand counts as they judged it, not as the source filed it.
   */
  const [ratings, events] = await Promise.all([
    getEventRatings(),
    getEventsOver([...new Set(hours.map((hour) => hour.day))]),
  ]);

  const news = applyRatings(events, ratings)
    .filter((event) => event.kind === "release" && event.impact === "high" && event.at)
    .map((event) => ({ at: event.at as string, title: event.title, currency: event.currency }));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Volume Alert</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Ce que l&apos;alerte a tiré — et le seuil que ça recommande
        </div>
      </div>
      <VolumeAlertTabs hours={hours} days={days} news={news} />
    </div>
  );
}
