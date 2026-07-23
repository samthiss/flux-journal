import { getChecklistForToday } from "@/lib/actions/checklist";
import ChecklistClient from "@/components/ChecklistClient";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const items = await getChecklistForToday();

  return <ChecklistClient items={items} />;
}
