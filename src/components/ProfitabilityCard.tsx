"use client";

import { accentColor, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import { CountUp } from "@/components/NeonText";
import { payoffTargets, projectPayoff, type computeDashboardStats, type computeSetupStats } from "@/lib/stats";

const pct = (n: number) => `${(n * 100).toFixed(1)} %`;

const label = { fontSize: 12, color: "oklch(0.6 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" } as const;
const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/**
 * Win rate against the win rate this payoff demands.
 *
 * The bar is the whole point of the card: a number like "64.8 %" says nothing
 * on its own, and the same number is excellent at a payoff of 1.2 and fatal at
 * 0.4. The tick is the line the fill has to clear.
 */
function BreakevenBar({ winRate, breakeven, height = 10 }: { winRate: number; breakeven: number; height?: number }) {
  const above = winRate >= breakeven;
  const tone = above ? accentColor : lossColor;
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 2,
        background: "oklch(0.24 0.03 250)",
        border: "1px solid oklch(0.3 0.04 250)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(winRate, 1) * 100}%`,
          height: "100%",
          background: tone,
          opacity: 0.55,
          boxShadow: `0 0 12px ${tone}`,
          transition: "width 0.5s ease",
        }}
      />
      {breakeven > 0 && (
        <div
          title="Seuil de rentabilité"
          style={{
            position: "absolute",
            top: -1,
            bottom: -1,
            left: `${Math.min(breakeven, 1) * 100}%`,
            width: 2,
            background: "oklch(0.95 0.005 250)",
            boxShadow: "0 0 8px oklch(0.95 0.005 250)",
          }}
        />
      )}
    </div>
  );
}

function Figure({ title, value, hint, color }: { title: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <div style={label}>{title}</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 600, marginTop: 6, color: color ?? "oklch(0.96 0.0068 250)" }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export default function ProfitabilityCard({
  stats,
  setups,
}: {
  stats: ReturnType<typeof computeDashboardStats>;
  setups: ReturnType<typeof computeSetupStats>;
}) {
  const { winRate, payoff, breakevenWinRate, expectancy, expectancyR, avgWin, avgLoss, totalPnl } = stats;
  const margin = winRate - breakevenWinRate;
  const profitable = stats.hasTrades && margin > 0;

  return (
    <div style={{ ...glassCard, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={label}>Rentabilité</div>
          <div style={{ ...mono, fontSize: 12, color: "oklch(0.55 0.03 250)", marginTop: 6 }}>
            {/* Every trade is counted as a win or a loss, so the two lists
                together are the period's whole population. */}
            {stats.wins.length + stats.losses.length} trades · gain moyen {fmtMoney(avgWin)} · perte moyenne{" "}
            {fmtMoney(avgLoss)}
          </div>
        </div>
        {/* The figure everything else in the card explains: what the period
            actually paid, before it is broken into a rate and a ratio. */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              ...mono,
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.1,
              color: totalPnl >= 0 ? winColor : lossColor,
            }}
          >
            <CountUp value={totalPnl} format={fmtMoney} duration={900} />
          </div>
          <div style={{ ...label, marginTop: 4 }}>P&amp;L total</div>
        </div>
      </div>

      <div className="profit-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, margin: "18px 0 20px" }}>
        <Figure
          title="Ratio gain / perte"
          value={payoff > 0 ? payoff.toFixed(2) : "—"}
          hint="combien rapporte un gain pour une perte"
        />
        <Figure title="Win rate" value={pct(winRate)} hint={`${stats.wins.length}W / ${stats.losses.length}L`} />
        <Figure
          title="Win rate requis"
          value={breakevenWinRate > 0 ? pct(breakevenWinRate) : "—"}
          hint="pour être à zéro avec ce ratio"
        />
        <Figure
          title="Espérance / trade"
          value={fmtMoney(expectancy)}
          hint={`${expectancyR >= 0 ? "+" : "−"}${Math.abs(expectancyR).toFixed(2)} R`}
          color={expectancy >= 0 ? winColor : lossColor}
        />
      </div>

      <BreakevenBar winRate={winRate} breakeven={breakevenWinRate} height={12} />
      <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 10 }}>
        {!stats.hasTrades ? (
          "Aucun trade sur la période."
        ) : (
          <>
            <span style={{ color: profitable ? accentColor : lossColor, fontWeight: 600 }}>
              {margin >= 0 ? "+" : "−"}
              <CountUp value={Math.abs(margin) * 100} format={(n) => n.toFixed(1)} /> points
            </span>{" "}
            {profitable ? "au-dessus" : "en dessous"} du seuil. Avec un ratio de{" "}
            {payoff > 0 ? payoff.toFixed(2) : "—"}, il faut gagner {breakevenWinRate > 0 ? pct(breakevenWinRate) : "—"} des
            trades pour être à zéro.
          </>
        )}
      </div>

      {stats.hasTrades && payoff > 0 && (
        <div style={{ marginTop: 22, borderTop: "1px solid oklch(0.28 0.04 250)", paddingTop: 16 }}>
          <div style={{ ...label, marginBottom: 4 }}>Objectif</div>
          <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginBottom: 14 }}>
            Ce que rapporterait un meilleur ratio, à perte moyenne inchangée. La dernière colonne est le taux de réussite
            en dessous duquel le nouveau ratio ne rapporte plus que ce que tu gagnes aujourd&apos;hui.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {payoffTargets(payoff).map((target) => {
              const p = projectPayoff(stats, target);
              const factor = expectancy > 0 ? p.expectancy / expectancy : 0;
              return (
                <div
                  key={target}
                  className="profit-target"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "baseline",
                    gap: 14,
                    padding: "10px 12px",
                    borderRadius: 3,
                    background: "oklch(0.84 0.17 196 / 0.06)",
                    border: "1px solid oklch(0.84 0.17 196 / 0.18)",
                  }}
                >
                  <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: accentColor }}>RR {target.toFixed(1)}</div>
                  <div style={{ ...mono, fontSize: 12.5, color: "oklch(0.85 0.02 250)" }}>
                    {fmtMoney(p.expectancy)} / trade
                    {factor > 1 && (
                      <span style={{ color: "oklch(0.6 0.03 250)" }}> · ×{factor.toFixed(1)} ce que tu gagnes</span>
                    )}
                    <span style={{ color: "oklch(0.6 0.03 250)" }}> · {fmtMoney(p.expectancy * 100)} sur 100 trades</span>
                  </div>
                  <div style={{ ...mono, fontSize: 12, color: "oklch(0.62 0.03 250)", whiteSpace: "nowrap" }}>
                    tenable jusqu&apos;à {pct(p.sustainableWinRate)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 12 }}>
            Un objectif plus lointain est touché moins souvent : viser {payoffTargets(payoff)[0].toFixed(1)} te laisse
            perdre{" "}
            <span style={{ color: accentColor, fontWeight: 600 }}>
              {((winRate - projectPayoff(stats, payoffTargets(payoff)[0]).sustainableWinRate) * 100).toFixed(0)} points
            </span>{" "}
            de réussite avant de gagner moins qu&apos;aujourd&apos;hui.
          </div>
        </div>
      )}

      {setups.length > 1 && (
        <div style={{ marginTop: 22, borderTop: "1px solid oklch(0.28 0.04 250)", paddingTop: 16 }}>
          <div style={{ ...label, marginBottom: 12 }}>Par setup</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {setups.map((s) => {
              const setupMargin = s.winRate - s.breakevenWinRate;
              const ok = s.expectancy >= 0;
              return (
                <div key={s.setup}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {s.setup} <span style={{ ...mono, fontSize: 11, color: "oklch(0.5 0.03 250)" }}>n={s.count}</span>
                    </div>
                    <div style={{ ...mono, fontSize: 11.5, color: "oklch(0.62 0.03 250)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <span>RR {s.payoff > 0 ? s.payoff.toFixed(2) : "—"}</span>
                      <span>WR {pct(s.winRate)}</span>
                      <span>requis {s.breakevenWinRate > 0 ? pct(s.breakevenWinRate) : "—"}</span>
                      <span style={{ color: ok ? winColor : lossColor, fontWeight: 600 }}>{fmtMoney(s.expectancy)} / trade</span>
                      <span style={{ color: s.totalPnl >= 0 ? winColor : lossColor }}>{fmtMoney(s.totalPnl)} au total</span>
                    </div>
                  </div>
                  <BreakevenBar winRate={s.winRate} breakeven={s.breakevenWinRate} />
                  {/* A setup living within a couple of points of its own breakeven
                      line is the thing this card exists to surface: it reads as
                      profitable in the totals and is one bad week from not. */}
                  {s.payoff > 0 && setupMargin > 0 && setupMargin < 0.05 && (
                    <div style={{ fontSize: 11.5, color: lossColor, marginTop: 5 }}>
                      À {(setupMargin * 100).toFixed(1)} points seulement de son seuil.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
