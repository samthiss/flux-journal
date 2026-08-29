import { cookies } from "next/headers";
import RiskCalculator from "@/components/RiskCalculator";
import { PageTitle } from "@/components/NeonText";

export const dynamic = "force-dynamic";

export default async function RisquePage() {
  // The last figures used, read on the server for the same reason the period is:
  // filled in after mount, the page would paint someone else's account first.
  // Only finite numbers and the symbol survive the trip — the cookie is whatever
  // the browser sends, and a NaN would spread through every figure on the page.
  let initialSettings: Record<string, number | string> = {};
  try {
    const raw = (await cookies()).get("risk-calc")?.value;
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) initialSettings[k] = v;
        if (k === "symbol" && typeof v === "string") initialSettings[k] = v;
      }
    }
  } catch {
    initialSettings = {};
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Risque</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Ce qu&apos;un trade risque, et la taille que ce risque autorise
        </div>
      </div>
      <RiskCalculator initialSettings={initialSettings} />
    </div>
  );
}
