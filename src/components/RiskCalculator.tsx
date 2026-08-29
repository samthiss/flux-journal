"use client";

import { useMemo, useState } from "react";
import { accentColor, glassCard, winColor, lossColor } from "@/lib/theme";

const STORE_KEY = "risk-calc";

/**
 * Tick values as a starting point, not as truth.
 *
 * They are the CME specifications for these contracts at the time of writing;
 * a broker's own figures, and any contract change, win over this table — which
 * is why the field stays editable and says so.
 */
const TICK_VALUES: Record<string, number> = {
  "6E": 6.25,
  "6B": 6.25,
  "6J": 6.25,
  ZS: 12.5,
  ZM: 10,
};

type Settings = {
  accountSize: number;
  maxRiskPct: number;
  symbol: string;
  lots: number;
  stopTicks: number;
  tickValue: number;
  /** Round-turn cost of one lot: commission plus exchange and clearing fees. */
  feePerLot: number;
};

const DEFAULTS: Settings = {
  accountSize: 50000,
  maxRiskPct: 1,
  symbol: "6E",
  lots: 2,
  stopTicks: 20,
  tickValue: TICK_VALUES["6E"],
  feePerLot: 4,
};

/**
 * Amounts here are costs and allowances, not results: `fmtMoney` would sign
 * them, and "+$129.00 of risk per lot" reads backwards.
 */
const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

const label = { fontSize: 12, color: "oklch(0.6 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" } as const;
const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

const fieldStyle: React.CSSProperties = {
  ...mono,
  fontSize: 13,
  padding: "9px 11px",
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
  hint,
}: {
  title: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>
        {title}
        {suffix && <span style={{ textTransform: "none", letterSpacing: 0 }}> {suffix}</span>}
      </div>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={fieldStyle} />
      {hint && <div style={{ fontSize: 11, color: "oklch(0.5 0.03 250)", marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

function Figure({ title, value, hint, color }: { title: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <div style={{ ...label, fontSize: 11 }}>{title}</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 6, color: color ?? "oklch(0.96 0.0068 250)" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/**
 * What a trade risks, and what size that risk allows.
 *
 * Both directions of the same arithmetic. `lots × ticks × tick value` is the
 * loss the stop implies; the fees are added to it because they are paid whether
 * the trade wins or loses, and a stop that looks like 1% of the account is more
 * than that once the round turn is counted.
 */
export default function RiskCalculator({ initialSettings }: { initialSettings: Partial<Settings> }) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS, ...initialSettings });

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => {
      const next = { ...s, [key]: value };
      try {
        document.cookie = `${STORE_KEY}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${60 * 60 * 24 * 365}`;
      } catch {}
      return next;
    });

  // Changing the contract brings its tick value with it, since the two always
  // travel together — and it stays editable afterwards.
  const chooseSymbol = (symbol: string) =>
    setSettings((s) => {
      const next = { ...s, symbol, tickValue: TICK_VALUES[symbol] ?? s.tickValue };
      try {
        document.cookie = `${STORE_KEY}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${60 * 60 * 24 * 365}`;
      } catch {}
      return next;
    });

  const r = useMemo(() => {
    const stopLoss = Math.abs(settings.stopTicks) * Math.abs(settings.tickValue);
    const fees = Math.abs(settings.feePerLot);
    const perLot = stopLoss + fees;
    const lots = Math.max(0, Math.floor(settings.lots));
    const total = perLot * lots;

    const budget = (settings.accountSize * settings.maxRiskPct) / 100;
    // The size the budget allows: whole lots only, since half a contract is not
    // a thing that can be traded.
    const affordable = perLot > 0 ? Math.floor(budget / perLot) : 0;

    return {
      perLot,
      stopLossPerLot: stopLoss,
      feesTotal: fees * lots,
      total,
      pctOfAccount: settings.accountSize > 0 ? total / settings.accountSize : 0,
      budget,
      affordable,
      // What the stop has to be worth for the size actually chosen to fit the
      // budget — the other lever when the lots are not negotiable.
      maxTicks:
        lots > 0 && settings.tickValue > 0 ? Math.floor((budget / lots - fees) / Math.abs(settings.tickValue)) : 0,
    };
  }, [settings]);

  const overBudget = r.total > r.budget;

  return (
    <div>
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>Le trade</div>
        <div
          className="challenge-fields"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "16px 0" }}
        >
          <label style={{ display: "block", minWidth: 0 }}>
            <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>Contrat</div>
            <select value={settings.symbol} onChange={(e) => chooseSymbol(e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
              {Object.keys(TICK_VALUES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Field title="Lots" value={settings.lots} onChange={(n) => set("lots", n)} />
          <Field title="Stop" value={settings.stopTicks} onChange={(n) => set("stopTicks", n)} suffix="ticks" />
          <Field
            title="Valeur du tick"
            value={settings.tickValue}
            onChange={(n) => set("tickValue", n)}
            suffix="$"
            hint="préremplie par contrat — vérifie chez ton broker"
          />
          <Field
            title="Frais"
            value={settings.feePerLot}
            onChange={(n) => set("feePerLot", n)}
            suffix="$ / lot"
            hint="aller-retour, commission + frais de bourse"
          />
          <Field title="Compte" value={settings.accountSize} onChange={(n) => set("accountSize", n)} suffix="$" />
        </div>
      </div>

      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>Risque</div>
        <div
          className="profit-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 16 }}
        >
          <Figure
            title="Risque total"
            value={money(r.total)}
            hint={`${settings.lots} lot(s) × ${money(r.perLot)}`}
            color={lossColor}
          />
          <Figure
            title="Part du compte"
            value={`${(r.pctOfAccount * 100).toFixed(2)} %`}
            hint={`budget : ${settings.maxRiskPct} % = ${money(r.budget)}`}
            color={overBudget ? lossColor : winColor}
          />
          <Figure
            title="Dont frais"
            value={money(r.feesTotal)}
            hint={r.total > 0 ? `${((r.feesTotal / r.total) * 100).toFixed(1)} % du risque` : undefined}
          />
        </div>
        <div style={{ fontSize: 13, color: "oklch(0.72 0.02 250)", marginTop: 16, lineHeight: 1.6 }}>
          Un stop de {settings.stopTicks} ticks à {money(settings.tickValue)} le tick coûte {money(r.stopLossPerLot)} par
          lot, {money(settings.feePerLot)} de frais en plus, soit{" "}
          <span style={{ color: accentColor, fontWeight: 600 }}>{money(r.perLot)} par lot</span>. C&apos;est aussi ce que
          vaut 1 R : un take profit à 2 R rapporterait{" "}
          <span style={{ color: winColor, fontWeight: 600 }}>
            {money(r.stopLossPerLot * 2 * settings.lots - r.feesTotal)}
          </span>{" "}
          net de frais.
        </div>
      </div>

      <div style={glassCard}>
        <div style={label}>Taille autorisée</div>
        <div
          className="challenge-fields"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "16px 0" }}
        >
          <Field
            title="Risque max"
            value={settings.maxRiskPct}
            onChange={(n) => set("maxRiskPct", n)}
            suffix="% du compte"
          />
        </div>
        <div
          className="profit-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 4 }}
        >
          <Figure
            title="Lots possibles"
            value={String(r.affordable)}
            hint={`pour ${money(r.budget)} de risque`}
            color={r.affordable >= settings.lots ? winColor : lossColor}
          />
          <Figure
            title="Stop maximum"
            value={r.maxTicks > 0 ? `${r.maxTicks} ticks` : "—"}
            hint={`en gardant ${settings.lots} lot(s)`}
          />
          <Figure
            title="Verdict"
            value={overBudget ? "hors budget" : "dans le budget"}
            color={overBudget ? lossColor : winColor}
            hint={
              overBudget
                ? `${money(r.total - r.budget)} de trop`
                : `il reste ${money(r.budget - r.total)} de marge`
            }
          />
        </div>
      </div>
    </div>
  );
}
