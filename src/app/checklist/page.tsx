import { getChecklistItems } from "@/lib/actions/checklist";
import { getEconomicEvents } from "@/lib/economicCalendar";
import ChecklistTabs from "@/components/ChecklistTabs";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  // Read here rather than in the browser: the feed sets no CORS headers, and
  // its own cache means one read serves every visit for the hour.
  const [items, calendar] = await Promise.all([getChecklistItems(), getEconomicEvents()]);

  return <ChecklistTabs items={items} events={calendar.events} calendarOk={calendar.ok} calendarSource={calendar.source} />;
}
