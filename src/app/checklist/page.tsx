import { getChecklistForToday } from "@/lib/actions/checklist";
import ChecklistTabs from "@/components/ChecklistTabs";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const items = await getChecklistForToday();

  return <ChecklistTabs items={items} />;
}
