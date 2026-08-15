import TradeDetail from "@/components/TradeDetail";
import TradeModal from "@/components/TradeModal";

export const dynamic = "force-dynamic";

export default async function TradeModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <TradeModal>
      <TradeDetail id={id} />
    </TradeModal>
  );
}
