import { getChecklistItems } from "@/lib/actions/checklist";
import ChecklistTabs from "@/components/ChecklistTabs";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const items = await getChecklistItems();

  return <ChecklistTabs items={items} />;
}
