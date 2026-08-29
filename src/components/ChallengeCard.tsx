"use client";

import { useMemo, useState } from "react";
import { accentColor, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import { applyHaircut, simulateChallenge, simulateFundedMonth, type ChallengeParams } from "@/lib/challenge";
import type { TradeWithOutcome } from "@/lib/stats";

const STORE_KEY = "challenge-params";

type Settings = {
  target: number;
  trailingDrawdown: number;
  dailyLossLimit: number;
  maxContracts: number;
  /** The size the recorded trades were taken at — what one unit of the sample is. */
  baseContracts: number;
  haircut: number;
};

const DEFAULTS: Settings = {
  target: 3000,
  trailingDrawdown: 2000,
  dailyLossLimit: 1000,
  maxContracts: 5,
  baseContracts: 2,
  haircut: 0.25,
};

const label = { fontSize: 12, color: "oklch(0.6 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" } as const;
const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;

const fieldStyle: React.CSSProperties = {
  ...mono,
  fontSize: 13,
  padding: "8px 10px",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid oklch(0.34 0.04 250)",
  background: "oklch(0.16 0.03 250)",
  color: "oklch(0.9 0.017 250)",
  outline: "none",
};

function Field({
  title,
  value,
  onChange,
  suffix,
}: {
  title: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>
        {title}
        {suffix && <span style={{ textTransform: "none", letterSpacing: 0 }}> {suffix}</span>}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={fieldStyle}
      />
    </label>
  );
}

export default function ChallengeCard({
  trades,
  initialSettings,
}: {
  trades: TradeWithOutcome[];
  initialSettings: Partial<Settings>;
}) {
  // The account's terms arrive from the server, read out of a cookie, for the
  // same reason the period does: filled in on the client after mount, the first
  // paint would show someone else's account and then swap.
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS, ...initialSettings });
  const [strategy, setStrategy] = useState("all");

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => {
      const next = { ...s, [key]: value };
      try {
        document.cookie = `${STORE_KEY}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${60 * 60 * 24 * 365}`;
      } catch {}
      return next;
    });

  const setups = useMemo(() => [...new Set(trades.map((t) => t.setup))].sort(), [trades]);

  const sample = useMemo(() => {
    const rows = strategy === "all" ? trades : trades.filter((t) => t.setup === strategy);
    return rows.map((t) => t.pnl);
  }, [trades, strategy]);

  // Trades per trading day, from the journal itself rather than a guess: it is
  // what turns "42 trades to pass" into a number of days.
  const tradesPerDay = useMemo(() => {
    const rows = strategy === "all" ? trades : trades.filter((t) => t.setup === strategy);
    const days = new Set(rows.map((t) => t.date.toISOString().slice(0, 10)));
    return days.size ? rows.length / days.size : 1;
  }, [trades, strategy]);

  const params: ChallengeParams = {
    target: settings.target,
    trailingDrawdown: settings.trailingDrawdown,
    dailyLossLimit: settings.dailyLossLimit,
    tradesPerDay,
    maxDays: 120,
  };

  const rows = useMemo(() => {
    const pnls = applyHaircut(sample, settings.haircut);
    const base = settings.baseContracts || 1;
    return Array.from({ length: Math.max(1, Math.min(settings.maxContracts, 10)) }, (_, i) => {
      const contracts = i + 1;
      const scale = contracts / base;
      return {
        contracts,
        challenge: simulateChallenge(pnls, scale, params, 3000),
        funded: simulateFundedMonth(pnls, scale, params, 21, 2000),
      };
    });
    // params is derived from settings and tradesPerDay, both of which are listed.
  }, [sample, settings, tradesPerDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // The row worth recommending: the fastest size whose bust risk stays under
  // one in ten. Speed is worth nothing if the account is gone.
  const best = [...rows].reverse().find((r) => r.challenge.bustRate <= 0.1) ?? rows[0];
  const thin = sample.length < 60;

  return (
    <div style={{ ...glassCard, marginBottom: 20 }}>
      <div style={label}>Challenge prop firm</div>
      <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8, maxWidth: 720 }}>
        Chaque taille est rejouée 3 000 fois, en tirant tes trades au hasard dans l&apos;historique sélectionné. Le
        drawdown se mesure sur l&apos;équity après trade, la perte journalière arrête la journée, et une simulation qui
        n&apos;a pas atteint l&apos;objectif en 120 jours de trading est comptée comme trop lente.
      </div>

      <div
        className="challenge-fields"
        style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, margin: "18px 0" }}
      >
        <Field title="Objectif" value={settings.target} onChange={(n) => set("target", n)} suffix="$" />
        <Field
          title="Trailing DD"
          value={settings.trailingDrawdown}
          onChange={(n) => set("trailingDrawdown", n)}
          suffix="$"
        />
        <Field
          title="Perte / jour"
          value={settings.dailyLossLimit}
          onChange={(n) => set("dailyLossLimit", n)}
          suffix="$"
        />
        <Field title="Contrats max" value={settings.maxContracts} onChange={(n) => set("maxContracts", n)} />
        <Field
          title="Taille historique"
          value={settings.baseContracts}
          onChange={(n) => set("baseContracts", n)}
          suffix="contrats"
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} style={{ ...fieldStyle, width: "auto", cursor: "pointer" }}>
          <option value="all">Tous les setups</option>
          {setups.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={settings.haircut}
          onChange={(e) => set("haircut", Number(e.target.value))}
          style={{ ...fieldStyle, width: "auto", cursor: "pointer" }}
        >
          <option value={0}>Scénario : tel quel</option>
          <option value={0.25}>Scénario prudent : gains −25 %</option>
          <option value={0.4}>Scénario pessimiste : gains −40 %</option>
        </select>
        <span style={{ ...mono, fontSize: 11.5, color: "oklch(0.55 0.03 250)" }}>
          {sample.length} trades · {tradesPerDay.toFixed(1)} / jour
        </span>
      </div>

      {thin && (
        <div
          style={{
            fontSize: 12.5,
            color: lossColor,
            border: `1px solid oklch(0.7 0.25 18 / 0.35)`,
            background: "oklch(0.7 0.25 18 / 0.08)",
            borderRadius: 4,
            padding: "8px 10px",
            marginBottom: 16,
          }}
        >
          {sample.length}{" "}
          trades seulement dans cet échantillon. Une bonne série suffit à faire paraître une stratégie
          increvable — garde le scénario prudent tant que tu n&apos;as pas plus d&apos;historique.
        </div>
      )}

      <div className="table-scroll">
        <div style={{ minWidth: 720 }}>
          <div
            style={{
              ...mono,
              display: "grid",
              gridTemplateColumns: "90px repeat(5, 1fr)",
              gap: 8,
              fontSize: 11,
              color: "oklch(0.55 0.03 250)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "0 4px 8px",
            }}
          >
            <div>Contrats</div>
            <div>Réussite</div>
            <div>Compte perdu</div>
            <div>Jours (méd.)</div>
            <div>Mois financé (méd.)</div>
            <div>Pire mois sur 10</div>
          </div>

          {rows.map((r) => {
            const recommended = r.contracts === best?.contracts;
            return (
              <div
                key={r.contracts}
                style={{
                  ...mono,
                  display: "grid",
                  gridTemplateColumns: "90px repeat(5, 1fr)",
                  gap: 8,
                  fontSize: 13,
                  alignItems: "baseline",
                  padding: "10px 4px",
                  borderTop: "1px solid oklch(0.26 0.03 250)",
                  background: recommended ? "oklch(0.84 0.17 196 / 0.07)" : "transparent",
                }}
              >
                <div style={{ fontWeight: 700, color: recommended ? accentColor : "oklch(0.9 0.017 250)" }}>
                  {r.contracts}
                  {recommended && <span style={{ fontSize: 10, marginLeft: 6 }}>✓</span>}
                </div>
                <div style={{ color: r.challenge.passRate >= 0.7 ? winColor : "oklch(0.85 0.02 250)" }}>
                  {pct(r.challenge.passRate)}
                  {/* Without this the rest of the runs are unaccounted for: a
                      size that neither passes nor busts spent 120 days going
                      nowhere, which is a real answer and not a missing one. */}
                  {r.challenge.timeoutRate > 0.05 && (
                    <div style={{ fontSize: 10.5, color: "oklch(0.55 0.03 250)" }}>
                      {pct(r.challenge.timeoutRate)} trop lent
                    </div>
                  )}
                </div>
                <div style={{ color: r.challenge.bustRate > 0.1 ? lossColor : "oklch(0.7 0.02 250)" }}>
                  {pct(r.challenge.bustRate)}
                </div>
                <div style={{ color: "oklch(0.8 0.02 250)" }}>
                  {r.challenge.passRate > 0 ? `${r.challenge.medianDays}` : "—"}
                  <span style={{ fontSize: 11, color: "oklch(0.5 0.03 250)" }}>
                    {r.challenge.passRate > 0 ? ` (${r.challenge.p10Days}–${r.challenge.p90Days})` : ""}
                  </span>
                </div>
                <div style={{ color: r.funded.median >= 0 ? winColor : lossColor }}>{fmtMoney(r.funded.median)}</div>
                <div style={{ color: r.funded.p10 >= 0 ? "oklch(0.7 0.02 250)" : lossColor }}>
                  {fmtMoney(r.funded.p10)}
                  {r.funded.ruinRate > 0.02 && (
                    <span style={{ color: lossColor, fontSize: 11 }}> · compte perdu {pct(r.funded.ruinRate)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {best && sample.length > 0 && (
        <div style={{ fontSize: 13, color: "oklch(0.72 0.02 250)", marginTop: 16, lineHeight: 1.6 }}>
          À <span style={{ color: accentColor, fontWeight: 600 }}>{best.contracts} contrat{best.contracts > 1 ? "s" : ""}</span>,
          le challenge passe dans <span style={{ color: accentColor, fontWeight: 600 }}>{pct(best.challenge.passRate)}</span>{" "}
          des simulations, en {best.challenge.medianDays} jours de trading en médiane (
          {best.challenge.p10Days}–{best.challenge.p90Days}), soit environ{" "}
          {(best.challenge.medianDays / 21).toFixed(1)} mois à {tradesPerDay.toFixed(1)} trades par jour. Le compte est
          perdu dans {pct(best.challenge.bustRate)} des cas. Une fois financé, le mois médian rapporte{" "}
          <span style={{ color: best.funded.median >= 0 ? winColor : lossColor, fontWeight: 600 }}>
            {fmtMoney(best.funded.median)}
          </span>
          , et un mois sur dix est en dessous de {fmtMoney(best.funded.p10)}.
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 14, lineHeight: 1.6 }}>
        Le modèle suppose des trades indépendants, un P&amp;L proportionnel à la taille, et que ton édge futur ressemble à
        celui enregistré. Il ne connaît ni les séries liées à un régime de marché, ni le tilt après une mauvaise journée,
        ni le slippage qui vient avec la taille. C&apos;est un ordre de grandeur, pas une promesse.
      </div>
    </div>
  );
}
