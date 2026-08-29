"use client";

import { useMemo, useState } from "react";
import { accentColor, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import {
  partialOutcomes,
  partialSample,
  simulateChallenge,
  simulateFundedMonth,
  syntheticSample,
  type ChallengeParams,
  type PartialExit,
} from "@/lib/challenge";

const STORE_KEY = "challenge-params";
const DAYS_PER_MONTH = 21;

type Settings = {
  /** The funded account's size. It scales nothing — it is what the rest is read against. */
  accountSize: number;
  target: number;
  trailingDrawdown: number;
  dailyLossLimit: number;
  winRate: number;
  payoff: number;
  tradesPerMonth: number;
  risk: number;

  /** Partial exits: off by default, since a single target is the simpler read. */
  splitExit: boolean;
  share1: number;
  tp1R: number;
  tp2R: number;
  tp2Rate: number;
  breakevenAfterTp1: boolean;
};

const DEFAULTS: Settings = {
  accountSize: 50000,
  target: 3000,
  trailingDrawdown: 2000,
  dailyLossLimit: 1000,
  winRate: 55,
  payoff: 2,
  tradesPerMonth: 30,
  risk: 150,
  splitExit: false,
  share1: 70,
  tp1R: 1,
  tp2R: 2,
  tp2Rate: 50,
  breakevenAfterTp1: true,
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
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={fieldStyle} />
    </label>
  );
}

function Figure({ title, value, hint, color }: { title: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <div style={{ ...label, fontSize: 11 }}>{title}</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 600, marginTop: 6, color: color ?? "oklch(0.96 0.0068 250)" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

/**
 * A prop-firm challenge, simulated from stated parameters.
 *
 * The trades are described rather than recorded: a win is RR times the risk, a
 * loss is the risk. Whether that passes cannot be answered by arithmetic —
 * hitting a trailing drawdown depends on the *order* the wins and losses arrive
 * in, and the same expectancy busts in one sequence and sails through in
 * another. So the parameters become a sample in the right proportion, replayed
 * three thousand times.
 *
 * The arithmetic answer is shown beside the simulated one on purpose: the gap
 * between "31 trades to the target" and the simulated median is what the
 * drawdown and the sequence cost.
 */
export default function ChallengeCard({ initialSettings }: { initialSettings: Partial<Settings> }) {
  // The terms arrive from the server, read out of a cookie, for the same reason
  // the period does: filled in on the client after mount, the first paint would
  // show someone else's account and then swap.
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS, ...initialSettings });

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => {
      const next = { ...s, [key]: value };
      try {
        document.cookie = `${STORE_KEY}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${60 * 60 * 24 * 365}`;
      } catch {}
      return next;
    });

  const result = useMemo(() => {
    const risk = Math.abs(settings.risk);
    const winRate = settings.winRate / 100;
    if (!risk || settings.tradesPerMonth <= 0) return null;

    // With partial exits the trade has three endings rather than two, so both
    // the sample and the expectancy come from that split instead of from a
    // single reward-to-risk.
    const exit: PartialExit = {
      share1: settings.share1 / 100,
      tp1R: settings.tp1R,
      tp2R: settings.tp2R,
      tp1Rate: winRate,
      tp2Rate: settings.tp2Rate / 100,
      breakevenAfterTp1: settings.breakevenAfterTp1,
      risk,
    };
    const split = settings.splitExit ? partialOutcomes(exit) : null;

    const pnls = split ? partialSample(exit) : syntheticSample(winRate, settings.payoff, risk);
    const perTrade = split ? split.expectancy : winRate * settings.payoff * risk - (1 - winRate) * risk;
    const payoff = split ? split.effectivePayoff : settings.payoff;
    const perDay = settings.tradesPerMonth / DAYS_PER_MONTH;
    const params: ChallengeParams = {
      target: settings.target,
      trailingDrawdown: settings.trailingDrawdown,
      dailyLossLimit: settings.dailyLossLimit,
      tradesPerDay: perDay,
      maxDays: 120,
    };

    return {
      split,
      payoff,
      perTrade,
      perMonth: perTrade * settings.tradesPerMonth,
      // What it takes if nothing goes wrong on the way. The simulation is the
      // same question with the drawdown in it.
      tradesToTarget: perTrade > 0 ? Math.ceil(settings.target / perTrade) : null,
      breakevenWinRate: 1 / (1 + payoff),
      challenge: simulateChallenge(pnls, 1, params, 3000),
      funded: simulateFundedMonth(pnls, 1, params, DAYS_PER_MONTH, 2000),
      perDay,
    };
  }, [settings]);

  const ofAccount = (n: number) =>
    settings.accountSize > 0 ? `${((n / settings.accountSize) * 100).toFixed(1)} %` : "—";

  return (
    <div style={{ ...glassCard, marginBottom: 20 }}>
      <div style={label}>Challenge prop firm</div>
      <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8, maxWidth: 760 }}>
        {settings.splitExit
          ? "La position sort en deux fois : une part à TP1, le reste à TP2. Les trois issues ci-dessous sont rejouées 3 000 fois."
          : "Un gain vaut RR fois le risque, une perte vaut le risque. La séquence est rejouée 3 000 fois."}{" "}
        Le drawdown se mesure sur l&apos;équity après trade, la perte journalière arrête la journée, et une simulation
        qui n&apos;a pas atteint l&apos;objectif en 120 jours de trading est comptée comme trop lente.
      </div>

      <div
        className="challenge-fields"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "18px 0 12px" }}
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
      </div>

      {settings.accountSize > 0 && (
        <div style={{ ...mono, fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginBottom: 16 }}>
          objectif {ofAccount(settings.target)} du compte · drawdown {ofAccount(settings.trailingDrawdown)} · perte
          journalière {ofAccount(settings.dailyLossLimit)}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          [false, "Sortie simple"],
          [true, "TP1 + TP2"],
        ].map(([value, text]) => (
          <span
            key={String(value)}
            onClick={() => set("splitExit", value as boolean)}
            style={{
              ...mono,
              fontSize: 11,
              padding: "5px 12px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${settings.splitExit === value ? "oklch(0.84 0.17 196 / 0.5)" : "oklch(0.32 0.03 250)"}`,
              background: settings.splitExit === value ? "oklch(0.84 0.17 196 / 0.14)" : "transparent",
              color: settings.splitExit === value ? accentColor : "oklch(0.6 0.03 250)",
            }}
          >
            {text as string}
          </span>
        ))}
      </div>

      <div
        className="challenge-fields"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: settings.splitExit ? 12 : 20 }}
      >
        <Field
          title={settings.splitExit ? "TP1 touché" : "Win rate"}
          value={settings.winRate}
          onChange={(n) => set("winRate", n)}
          suffix="%"
        />
        {!settings.splitExit && (
          <Field title="RR" value={settings.payoff} onChange={(n) => set("payoff", n)} suffix="gain / perte" />
        )}
        <Field
          title="Trades"
          value={settings.tradesPerMonth}
          onChange={(n) => set("tradesPerMonth", n)}
          suffix="/ mois"
        />
        <Field title="Risque" value={settings.risk} onChange={(n) => set("risk", n)} suffix="$ / trade" />
      </div>

      {settings.splitExit && (
        <>
          <div
            className="challenge-fields"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}
          >
            <Field title="Part TP1" value={settings.share1} onChange={(n) => set("share1", n)} suffix="%" />
            <Field title="TP1" value={settings.tp1R} onChange={(n) => set("tp1R", n)} suffix="× le risque" />
            <Field title="TP2" value={settings.tp2R} onChange={(n) => set("tp2R", n)} suffix="× le risque" />
            <Field
              title="TP2 après TP1"
              value={settings.tp2Rate}
              onChange={(n) => set("tp2Rate", n)}
              suffix="% du temps"
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              [true, "SL au point mort après TP1"],
              [false, "SL inchangé après TP1"],
            ].map(([value, text]) => (
              <span
                key={String(value)}
                onClick={() => set("breakevenAfterTp1", value as boolean)}
                style={{
                  ...mono,
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${
                    settings.breakevenAfterTp1 === value ? "oklch(0.84 0.17 196 / 0.5)" : "oklch(0.32 0.03 250)"
                  }`,
                  background: settings.breakevenAfterTp1 === value ? "oklch(0.84 0.17 196 / 0.14)" : "transparent",
                  color: settings.breakevenAfterTp1 === value ? accentColor : "oklch(0.6 0.03 250)",
                }}
              >
                {text as string}
              </span>
            ))}
          </div>
        </>
      )}

      {result?.split && (
        <div style={{ marginBottom: 20 }}>
          {/* The three ways the trade ends, which is what scaling out buys and
              costs: the middle row is the one a single reward-to-risk hides. */}
          {[
            ["Perte pleine", result.split.loss],
            [settings.breakevenAfterTp1 ? "TP1 seul, SL au point mort" : "TP1 seul, SL touché", result.split.tp1Only],
            ["TP1 + TP2", result.split.both],
          ].map(([title, o]) => {
            const outcome = o as { amount: number; probability: number };
            return (
              <div
                key={title as string}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "9px 12px",
                  borderTop: "1px solid oklch(0.26 0.03 250)",
                }}
              >
                <div style={{ fontSize: 13, color: "oklch(0.8 0.02 250)" }}>{title as string}</div>
                <div style={{ ...mono, fontSize: 13, display: "flex", gap: 16, alignItems: "baseline" }}>
                  <span style={{ color: "oklch(0.55 0.03 250)" }}>{pct(outcome.probability)}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      minWidth: 90,
                      textAlign: "right",
                      color: outcome.amount >= 0 ? winColor : lossColor,
                    }}
                  >
                    {fmtMoney(outcome.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result && (
        <>
          <div
            className="profit-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 18 }}
          >
            <Figure
              title="Espérance / trade"
              value={fmtMoney(result.perTrade)}
              hint={
                result.split
                  ? `RR effectif ${result.payoff.toFixed(2)} · seuil ${pct(result.breakevenWinRate)}`
                  : `seuil : ${pct(result.breakevenWinRate)} de réussite`
              }
              color={result.perTrade >= 0 ? winColor : lossColor}
            />
            <Figure
              title="P&L / mois"
              value={fmtMoney(result.perMonth)}
              hint={settings.accountSize > 0 ? `${ofAccount(result.perMonth)} du compte` : undefined}
              color={result.perMonth >= 0 ? winColor : lossColor}
            />
            <Figure
              title="Objectif atteint en"
              value={result.challenge.passRate > 0 ? `${result.challenge.medianDays} j` : "—"}
              hint={
                result.challenge.passRate > 0
                  ? `${result.challenge.p10Days}–${result.challenge.p90Days} j · ${(
                      result.challenge.medianDays / DAYS_PER_MONTH
                    ).toFixed(1)} mois`
                  : "jamais dans la simulation"
              }
            />
            <Figure
              title="Réussite"
              value={pct(result.challenge.passRate)}
              hint={`compte perdu ${pct(result.challenge.bustRate)}`}
              color={result.challenge.passRate >= 0.7 ? winColor : "oklch(0.96 0.0068 250)"}
            />
          </div>

          <div style={{ fontSize: 13, color: "oklch(0.72 0.02 250)", lineHeight: 1.6 }}>
            {result.tradesToTarget ? (
              <>
                Sans accroc, l&apos;objectif demande{" "}
                <span style={{ color: accentColor, fontWeight: 600 }}>{result.tradesToTarget} trades</span>, soit{" "}
                {Math.ceil(result.tradesToTarget / result.perDay)} jours de trading. En rejouant 3 000 fois avec le
                drawdown, la médiane est de {result.challenge.medianDays} jours et le compte est perdu dans{" "}
                {pct(result.challenge.bustRate)} des cas. Une fois financé, le mois médian rapporte{" "}
                <span style={{ color: result.funded.median >= 0 ? winColor : lossColor, fontWeight: 600 }}>
                  {fmtMoney(result.funded.median)}
                </span>{" "}
                et un mois sur dix est en dessous de {fmtMoney(result.funded.p10)}.
              </>
            ) : (
              <>
                À {settings.winRate} % de réussite pour un RR de {settings.payoff}, l&apos;espérance est négative : il
                faut {pct(result.breakevenWinRate)}{" "}
                de réussite pour être à zéro. Aucun objectif n&apos;est atteignable, seule la vitesse de la perte
                change.
              </>
            )}
          </div>
        </>
      )}

      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 14, lineHeight: 1.6 }}>
        Le modèle suppose des trades indépendants et un risque constant. Il ne connaît ni les séries liées à un régime de
        marché, ni le tilt après une mauvaise journée, ni le slippage. C&apos;est un ordre de grandeur, pas une promesse.
      </div>
    </div>
  );
}
