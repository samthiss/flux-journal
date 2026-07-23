import TradeForm from "@/components/TradeForm";
import { createTrade } from "@/lib/actions/trades";

export default function NewTradePage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <TradeForm
      action={createTrade}
      title="Add Trade"
      subtitle="Log a new entry to your journal"
      initial={{
        date: today,
        time: "",
        symbol: "",
        market: "",
        setup: "Trend run",
        side: "Long",
        size: "",
        pnl: "",
        rr: "",
        emotion: "Calm",
        preTradeNotes: "",
        postTradeNotes: "",
      }}
    />
  );
}
