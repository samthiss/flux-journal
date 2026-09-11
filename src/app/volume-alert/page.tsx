import { getAlertHours } from "@/lib/actions/volumeAlerts";
import VolumeAlertClient from "@/components/VolumeAlertClient";
import { PageTitle } from "@/components/NeonText";

export const dynamic = "force-dynamic";

export default async function VolumeAlertPage() {
  const hours = await getAlertHours();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Volume Alert</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Ce que l&apos;alerte a tiré, heure par heure — et le seuil que ça recommande
        </div>
      </div>
      <VolumeAlertClient hours={hours} />
    </div>
  );
}
