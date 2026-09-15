import AgentClient from "@/components/AgentClient";
import { PageTitle } from "@/components/NeonText";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Agent journal de trading</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Interroge ton journal — tes règles, tes chiffres, tes captures
        </div>
      </div>
      <AgentClient />
    </div>
  );
}
