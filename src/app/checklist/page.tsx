import { getChecklistItems } from "@/lib/actions/checklist";
import { getEventRatings } from "@/lib/actions/eventRatings";
import { applyRatings, getEconomicEvents } from "@/lib/economicCalendar";
import ChecklistTabs from "@/components/ChecklistTabs";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  // Read here rather than in the browser: the feed sets no CORS headers, and
  // its own cache means one read serves every visit for the hour.
  const [items, calendar, ratings] = await Promise.all([
    getChecklistItems(),
    getEconomicEvents(),
    getEventRatings(),
  ]);

  return (
    <ChecklistTabs
      items={items}
      events={applyRatings(calendar.events, ratings)}
      calendarOk={calendar.ok}
      calendarSource={calendar.source}
    />
  );
}
