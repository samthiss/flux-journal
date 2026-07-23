import { getChecklistForToday } from "@/lib/actions/checklist";
import ChecklistClient from "@/components/ChecklistClient";

export default async function ChecklistPage() {
  const items = await getChecklistForToday();

  return <ChecklistClient items={items} />;
}
