import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CHART_SLOTS } from "@/lib/chartSlots";
import { deleteTrade } from "@/lib/actions/trades";
import { accentColor, accentSoft, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) notFound();

  const deleteTradeWithId = deleteTrade.bind(null, trade.id);

  const outcome = trade.pnl > 0 ? "win" : "loss";
  const pnlColor = trade.pnl > 0 ? winColor : lossColor;
  const sideColor = trade.side === "Long" ? accentColor : "oklch(0.6 0.02 290)";
  const badgeStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 20,
    background: outcome === "win" ? accentSoft : "oklch(0.3 0.01 290)",
    color: outcome === "win" ? winColor : "oklch(0.7 0.01 290)",
  };

  const statCards = [
    { label: "Size", value: trade.size },
    { label: "R : R", value: trade.rr != null ? `1 : ${trade.rr.toFixed(1)}` : "—" },
  ];

  const chartValues: Record<string, string | null> = {
    cluster: trade.chartCluster,
    reverse: trade.chartReverse,
    box: trade.chartBox,
    trading: trade.chartTrading,
  };

  return (
    <div style={{ width: "100%" }}>
      <div className="trade-detail-header">
        <Link
          href="/trades"
          style={{
            cursor: "pointer",
            width: 34,
            height: 34,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid oklch(0.36 0.03 290 / 0.6)",
            background: "oklch(0.18 0.02 290)",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M10 3L5 8l5 5" fill="none" stroke="oklch(0.85 0.01 290)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{trade.symbol}</div>
            <span style={badgeStyle}>{outcome === "win" ? "Win" : "Loss"}</span>
            <span style={{ fontSize: 13, color: sideColor, fontWeight: 600 }}>{trade.side}</span>
          </div>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.02 290)", marginTop: 2 }}>
            {trade.date.toISOString().slice(0, 10)} &middot; {trade.setup}
          </div>
        </div>
        <div className="trade-detail-pnl">
          <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 28, fontWeight: 700, color: pnlColor }}>
            {fmtMoney(trade.pnl)}
          </div>
          <div style={{ fontSize: 12, color: "oklch(0.55 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Realized P&amp;L
          </div>
        </div>
        <div className="trade-detail-actions">
          <Link
            href={`/trades/${trade.id}/edit`}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
              padding: "11px 18px",
              borderRadius: 9,
              background: accentColor,
              color: "oklch(0.12 0.01 290)",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M10.5 1.5l3 3L5 13l-3.5.5L2 10z" fill="none" stroke="oklch(0.12 0.01 290)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit
          </Link>
          <form action={deleteTradeWithId} style={{ flexShrink: 0, flex: 1 }}>
            <button
              type="submit"
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                fontSize: 13,
                fontWeight: 600,
                padding: "11px 18px",
                borderRadius: 9,
                border: "1px solid oklch(0.55 0.18 25 / 0.5)",
                background: "transparent",
                color: "oklch(0.65 0.18 25)",
                width: "100%",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15">
                <path
                  d="M3 4h9M5.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M6 7v4M9 7v4M4 4l.6 8a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9L10 4"
                  fill="none"
                  stroke="oklch(0.65 0.18 25)"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Delete
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 18 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ ...glassCard, padding: 16 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(0.55 0.02 290)" }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 18, fontWeight: 600, marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="trade-detail-columns">
        <div style={glassCard}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Details
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "oklch(0.6 0.02 290)" }}>Setup</span>
              <span style={{ fontWeight: 600 }}>{trade.setup}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "oklch(0.6 0.02 290)" }}>Market</span>
              <span style={{ fontWeight: 600 }}>{trade.market ?? "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "oklch(0.6 0.02 290)" }}>Direction</span>
              <span style={{ fontWeight: 600, color: sideColor }}>{trade.side}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "oklch(0.6 0.02 290)" }}>Emotion</span>
              <span style={{ fontWeight: 600 }}>{trade.emotion ?? "—"}</span>
            </div>
          </div>
        </div>
        <div style={glassCard}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Pre trade analysis
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "oklch(0.8 0.01 290)" }}>
            {trade.preTradeNotes || "No pre trade analysis recorded for this trade."}
          </div>
        </div>
      </div>

      <div style={{ ...glassCard, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
          Post trade analysis
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "oklch(0.8 0.01 290)" }}>
          {trade.postTradeNotes || "No post trade analysis recorded for this trade."}
        </div>
      </div>

      <div style={glassCard}>
        <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
          Charts
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {CHART_SLOTS.map((slot) => {
            const src = chartValues[slot.key];
            return (
              <div key={slot.key}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.78 0.02 290)", marginBottom: 8 }}>{slot.label}</div>
                {src ? (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16/10",
                      backgroundImage: `url(${src})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      borderRadius: 10,
                      border: "1px solid oklch(0.32 0.03 290 / 0.5)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16/10",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px dashed oklch(0.36 0.03 290 / 0.6)",
                      borderRadius: 10,
                      color: "oklch(0.5 0.02 290)",
                      fontSize: 12,
                    }}
                  >
                    No image
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
