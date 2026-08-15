import TradeDetail from "@/components/TradeDetail";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TradeDetail id={id} />;
}
