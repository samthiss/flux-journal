"use client";

import { useMemo, useState } from "react";
import { accentColor, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import {
  applyHaircut,
  simulateChallenge,
  simulateFundedMonth,
  syntheticSample,
  type ChallengeParams,
} from "@/lib/challenge";
import type { TradeWithOutcome } from "@/lib/stats";

const STORE_KEY = "challenge-params";

type Settings = {
  /** The funded account's size. It scales nothing — it is what the rest is read against. */
  accountSize: number;
  target: number;
  trailingDrawdown: number;
  dailyLossLimit: number;
  maxContracts: number;
  /** The size the recorded trades were taken at — what one unit of the sample is. */
  baseContracts: number;
  haircut: number;

  // Manual mode: the trades are described rather than drawn from the journal.
  winRate: number;
  payoff: number;
  tradesPerMonth: number;
  risk: number;
};

const DEFAULTS: Settings = {
  accountSize: 50000,
  target: 3000,
  trailingDrawdown: 2000,
  dailyLossLimit: 1000,
  maxContracts: 5,
  baseContracts: 2,
  haircut: 0.25,
  winRate: 55,
  payoff: 2,
  tradesPerMonth: 30,
  risk: 150,
};

const DAYS_PER_MONTH = 21;

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
  const [manual, setManual] = useState(false);

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

  const params: ChallengeParams = useMemo(
    () => ({
      target: settings.target,
      trailingDrawdown: settings.trailingDrawdown,
      dailyLossLimit: settings.dailyLossLimit,
      tradesPerDay,
      maxDays: 120,
    }),
    [settings.target, settings.trailingDrawdown, settings.dailyLossLimit, tradesPerDay]
  );

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

  // Manual mode runs the same engine on a described sample rather than a drawn
  // one, so the two modes cannot answer differently for the same numbers.
  const manualResult = useMemo(() => {
    const risk = Math.abs(settings.risk);
    const winRate = settings.winRate / 100;
    if (!risk || settings.tradesPerMonth <= 0) return null;

    const pnls = syntheticSample(winRate, settings.payoff, risk);
    const perTrade = winRate * settings.payoff * risk - (1 - winRate) * risk;
    const perDay = settings.tradesPerMonth / DAYS_PER_MONTH;
    const p: ChallengeParams = { ...params, tradesPerDay: perDay };

    return {
      perTrade,
      perMonth: perTrade * settings.tradesPerMonth,
      // The arithmetic answer: what it takes if nothing goes wrong on the way.
      // The simulation below is the same question with the drawdown in it.
      tradesToTarget: perTrade > 0 ? Math.ceil(settings.target / perTrade) : null,
      breakevenWinRate: 1 / (1 + settings.payoff),
      challenge: simulateChallenge(pnls, 1, p, 3000),
      funded: simulateFundedMonth(pnls, 1, p, DAYS_PER_MONTH, 2000),
      perDay,
    };
  }, [settings, params]);

  // The row worth recommending: the fastest size whose bust risk stays under
  // one in ten. Speed is worth nothing if the account is gone.
  const best = [...rows].reverse().find((r) => r.challenge.bustRate <= 0.1) ?? rows[0];
  const thin = sample.length < 60;
  const ofAccount = (n: number) =>
    settings.accountSize > 0 ? `${((n / settings.accountSize) * 100).toFixed(1)} %` : "—";

  return (
    <div style={{ ...glassCard, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={label}>Challenge prop firm</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            [false, "Depuis mon historique"],
            [true, "Paramètres manuels"],
          ].map(([value, text]) => (
            <span
              key={String(value)}
              onClick={() => setManual(value as boolean)}
              style={{
                ...mono,
                fontSize: 11,
                padding: "5px 12px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${manual === value ? "oklch(0.84 0.17 196 / 0.5)" : "oklch(0.32 0.03 250)"}`,
                background: manual === value ? "oklch(0.84 0.17 196 / 0.14)" : "transparent",
                color: manual === value ? accentColor : "oklch(0.6 0.03 250)",
              }}
            >
              {text as string}
            </span>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8, maxWidth: 720 }}>
        {manual
          ? "Les trades sont décrits plutôt que tirés du journal : un gain vaut RR fois le risque, une perte vaut le risque. Le reste de la simulation est identique."
          : "Chaque taille est rejouée 3 000 fois, en tirant tes trades au hasard dans l’historique sélectionné."}{" "}
        Le drawdown se mesure sur l&apos;équity après trade, la perte journalière arrête la journée, et une simulation
        qui n&apos;a pas atteint l&apos;objectif en 120 jours de trading est comptée comme trop lente.
      </div>

      <div
        className="challenge-fields"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${manual ? 4 : 6}, 1fr)`,
          gap: 12,
          margin: "18px 0 12px",
        }}
      >
        <Field title="Compte" value={settings.accountSize} onChange={(n) => set("accountSize", n)} suffix="$" />
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
        {!manual && (
          <>
            <Field title="Contrats max" value={settings.maxContracts} onChange={(n) => set("maxContracts", n)} />
            <Field
              title="Taille historique"
              value={settings.baseContracts}
              onChange={(n) => set("baseContracts", n)}
              suffix="contrats"
            />
          </>
        )}
      </div>

      {settings.accountSize > 0 && (
        <div style={{ ...mono, fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginBottom: 16 }}>
          objectif {ofAccount(settings.target)} du compte · drawdown {ofAccount(settings.trailingDrawdown)} · perte
          journalière {ofAccount(settings.dailyLossLimit)}
        </div>
      )}

      {!manual && (
        <>
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
          {settings.accountSize > 0 && <> — {ofAccount(best.funded.median)} du compte par mois</>}, et un mois sur dix
          est en dessous de {fmtMoney(best.funded.p10)}.
        </div>
      )}

        </>
      )}

      {manual && manualResult && (
        <>
          <div
            className="challenge-fields"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}
          >
            <Field title="Win rate" value={settings.winRate} onChange={(n) => set("winRate", n)} suffix="%" />
            <Field title="RR" value={settings.payoff} onChange={(n) => set("payoff", n)} suffix="gain / perte" />
            <Field
              title="Trades"
              value={settings.tradesPerMonth}
              onChange={(n) => set("tradesPerMonth", n)}
              suffix="/ mois"
            />
            <Field title="Risque" value={settings.risk} onChange={(n) => set("risk", n)} suffix="$ / trade" />
          </div>

          <div
            className="profit-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 18 }}
          >
            <div>
              <div style={{ ...label, fontSize: 11 }}>Espérance / trade</div>
              <div
                style={{
                  ...mono,
                  fontSize: 20,
                  fontWeight: 600,
                  marginTop: 6,
                  color: manualResult.perTrade >= 0 ? winColor : lossColor,
                }}
              >
                {fmtMoney(manualResult.perTrade)}
              </div>
              <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 3 }}>
                seuil : {pct(manualResult.breakevenWinRate)} de réussite
              </div>
            </div>
            <div>
              <div style={{ ...label, fontSize: 11 }}>P&amp;L / mois</div>
              <div
                style={{
                  ...mono,
                  fontSize: 20,
                  fontWeight: 600,
                  marginTop: 6,
                  color: manualResult.perMonth >= 0 ? winColor : lossColor,
                }}
              >
                {fmtMoney(manualResult.perMonth)}
              </div>
              <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 3 }}>
                {settings.accountSize > 0 ? `${ofAccount(manualResult.perMonth)} du compte` : ""}
              </div>
            </div>
            <div>
              <div style={{ ...label, fontSize: 11 }}>Objectif atteint en</div>
              <div style={{ ...mono, fontSize: 20, fontWeight: 600, marginTop: 6, color: "oklch(0.96 0.0068 250)" }}>
                {manualResult.challenge.passRate > 0 ? `${manualResult.challenge.medianDays} j` : "—"}
              </div>
              <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 3 }}>
                {manualResult.challenge.passRate > 0
                  ? `${manualResult.challenge.p10Days}–${manualResult.challenge.p90Days} j · ${(
                      manualResult.challenge.medianDays / DAYS_PER_MONTH
                    ).toFixed(1)} mois`
                  : "jamais dans la simulation"}
              </div>
            </div>
            <div>
              <div style={{ ...label, fontSize: 11 }}>Réussite</div>
              <div
                style={{
                  ...mono,
                  fontSize: 20,
                  fontWeight: 600,
                  marginTop: 6,
                  color: manualResult.challenge.passRate >= 0.7 ? winColor : "oklch(0.96 0.0068 250)",
                }}
              >
                {pct(manualResult.challenge.passRate)}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  marginTop: 3,
                  color: manualResult.challenge.bustRate > 0.1 ? lossColor : "oklch(0.55 0.03 250)",
                }}
              >
                compte perdu {pct(manualResult.challenge.bustRate)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "oklch(0.72 0.02 250)", lineHeight: 1.6 }}>
            {/* The arithmetic answer beside the simulated one: the gap between
                them is what the drawdown and the order of the trades cost. */}
            {manualResult.tradesToTarget ? (
              <>
                Sans accroc, l&apos;objectif demande{" "}
                <span style={{ color: accentColor, fontWeight: 600 }}>{manualResult.tradesToTarget} trades</span>, soit{" "}
                {Math.ceil(manualResult.tradesToTarget / manualResult.perDay)} jours de trading. En rejouant 3 000 fois
                avec le drawdown, la médiane est de {manualResult.challenge.medianDays} jours et le compte est perdu
                dans {pct(manualResult.challenge.bustRate)} des cas. Une fois financé, le mois médian rapporte{" "}
                <span
                  style={{ color: manualResult.funded.median >= 0 ? winColor : lossColor, fontWeight: 600 }}
                >
                  {fmtMoney(manualResult.funded.median)}
                </span>{" "}
                et un mois sur dix est en dessous de {fmtMoney(manualResult.funded.p10)}.
              </>
            ) : (
              <>
                À {settings.winRate} % de réussite pour un RR de {settings.payoff}, l&apos;espérance est négative :
                il faut {pct(manualResult.breakevenWinRate)}{" "}
                de réussite pour être à zéro. Aucun objectif n&apos;est
                atteignable, seule la vitesse de la perte change.
              </>
            )}
          </div>
        </>
      )}

      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 14, lineHeight: 1.6 }}>
        Le modèle suppose des trades indépendants, un P&amp;L proportionnel à la taille, et que ton édge futur ressemble à
        celui enregistré. Il ne connaît ni les séries liées à un régime de marché, ni le tilt après une mauvaise journée,
        ni le slippage qui vient avec la taille. C&apos;est un ordre de grandeur, pas une promesse.
      </div>
    </div>
  );
}
