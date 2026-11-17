import { redirect } from "next/navigation";

/** The page's old address: the News page became the Trading Plan. */
export default function ChecklistPage() {
  redirect("/trading-plan");
}
