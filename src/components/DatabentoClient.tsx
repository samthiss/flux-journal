"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, accentSoft, glassCard, lossColor, neonGlow, winColor } from "@/lib/theme";
import { MOIS, fieldStyle, fmtOffset, fmtUsd, label, mono, monthLabel, td, th, tone } from "@/components/BacktestUi";
import { PageTitle } from "@/components/NeonText";
import { ratioOf, kindOf, monthOf, OUTCOMES, type ConfigStats, type SymbolResult } from "@/lib/databento/engine";
import { DEFAULT_TIERS, feeRoundTrip, firmShares, fromRow, pairBudget, parseTiers, runAccount, tiersText, type AccountRules } from "@/lib/databento/account";
import { chooseDatabentoConfig } from "@/lib/actions/databento";
import { CONTRACTS } from "@/lib/contracts";
import { fmtDist, fmtDistBySymbol, fmtPrice, fmtZone, tickNote } from "@/lib/databento/format";

type Saved = { symbol: string; zones: number[]; result: string | null; chosenKey: string | null };
type Entry = { symbol: string; zones: number[]; result: SymbolResult | null; chosenKey: string | null };

const SETTINGS_KEY = "databento-settings";

/** The trader's account: MEDIUM at the prop firm, five pairs, a master and a slave to start with. */
const DEFAULT_ACCOUNT: AccountRules = {
  tiers: DEFAULT_TIERS,
  // The trader's own: half the firm's 1,000, two bad trades together and the day is over.
  dailyStop: 500,
  ddLimit: 2000,
  pairs: 8,
  safety: 30,
  ddMode: "eod",
  target: null,
  maxContracts: 5,
  maxLossPerTrade: 500,
  wholeLots: true,
  copies: 2,
  // LMI: all of it up to 30,000 made on the account, 90 % past it.
  split: { from: 30000, firm: 10 },
  // LMI's commission on one contract (2026-11-15): 3.22 on the currencies,
  // 4.12 on the grains, 1.52 on ZN — the round trip.
  fees: { perSide: false, bySymbol: { "6B": 3.22, "6E": 3.22, "6J": 3.22, "6N": 3.22, "6C": 3.22, ZN: 1.52, ZS: 4.12, ZW: 4.12 } },
};
const DD_MODE_TEXT = { eod: "suiveur fin de journée", intraday: "suiveur intraday" } as const;

/**
 * How many months the history spans, for "a month": not the months a pair
 * happened to trade in, which would make a pair that sat out three of them
 * look a third better than it was.
 */
const spanMonths = (r: { from: number; to: number }) => Math.max(1, (r.to - r.from) / (30.44 * 86400000));

const fmtDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const fmtPfOrInf = (pf: number | null) => (pf === null ? "∞" : pf.toFixed(2));
/** The way out, short. */
const exitShort = (c: ConfigStats["cfg"]) => {
  const k = kindOf(c);
  if (k === "fixed") return c.tp1 === c.tp2 ? `TP ${c.tp1}` : `TP1 ${c.tp1} / TP2 ${c.tp2}`;
  const trail = `trail +${c.act} à ${c.dist}`;
  return k === "trail" ? trail : `TP1 ${c.tp1} + ${trail}`;
};

function parseResult(raw: string | null): SymbolResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SymbolResult;
  } catch {
    return null;
  }
}

/** The configuration a symbol is read with: the one chosen, or the best. */
function retained(e: Entry): ConfigStats | null {
  if (!e.result?.top.length) return null;
  return e.result.top.find((c) => c.key === e.chosenKey) ?? e.result.top[0];
}




const smallField: React.CSSProperties = { ...fieldStyle, width: 64, padding: "5px 7px", fontSize: 12 };

function RuleRow({ on, onToggle, label: text, children }: { on: boolean; onToggle: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: on ? 1 : 0.55 }}>
      <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {text}
      </label>
      <div style={{ display: "flex", gap: 6, paddingLeft: 22 }}>{children}</div>
    </div>
  );
}




export default function DatabentoClient({ initial }: { initial: Saved[] }) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    initial.map((s) => ({ symbol: s.symbol, zones: s.zones, result: parseResult(s.result), chosenKey: s.chosenKey }))
  );
  const [, startTransition] = useTransition();

  // ---- The account rules, kept in the browser --------------------------------
  const [account, setAccount] = useState<AccountRules>(DEFAULT_ACCOUNT);
  const [tiersDraft, setTiersDraft] = useState(tiersText(DEFAULT_TIERS));
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (saved?.account) {
        // Saved before the daily limit became the trader's 500: moved there once.
        const account = (saved.rulesVersion ?? 1) < 2 ? { ...saved.account, dailyStop: DEFAULT_ACCOUNT.dailyStop } : saved.account;
        if ((saved.rulesVersion ?? 1) < 2) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, account, rulesVersion: 2 }));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own storage, read once after mount
        setAccount({ ...DEFAULT_ACCOUNT, ...account });
        setTiersDraft(tiersText(saved.account.tiers ?? DEFAULT_TIERS));
      }
    } catch {
      // ignore storage failures
    }
  }, []);
  const updateAccount = (a: AccountRules) => {
    setAccount(a);
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}");
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, account: a, rulesVersion: 2 }));
    } catch {
      // ignore storage failures
    }
  };

  const choisir = (s: string, key: string) => {
    const best = entries.find((e) => e.symbol === s)?.result?.top[0]?.key;
    const k = key === best ? null : key;
    setEntries((es) => es.map((e) => (e.symbol === s ? { ...e, chosenKey: k } : e)));
    startTransition(() => chooseDatabentoConfig(s, k));
  };

  // ---- Reports ------------------------------------------------------------------
  const analysed = entries.filter((e) => retained(e)).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const [view, setView] = useState<string>("general");
  const [detail, setDetail] = useState(false);

  const general = useMemo(() => {
    const per = analysed.map((e) => {
      const c = retained(e)!;
      const money = e.result!.tickValue * e.result!.settings.lots;
      // The commission, as ticks off each contract's result.
      const feeTicks = feeRoundTrip(account.fees, e.symbol) / e.result!.tickValue;
      return { e, c, money, feeTicks };
    });
    const trades = per
      .flatMap(({ e, c, money, feeTicks }) => c.trades.map(([m, ticks]) => ({ t: m * 60000, pnl: (ticks - feeTicks) * money, symbol: e.symbol })))
      .sort((a, b) => a.t - b.t);
    let eq = 0, peak = 0, maxDD = 0, win = 0, loss = 0, wins = 0;
    for (const t of trades) {
      eq += t.pnl;
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, peak - eq);
      if (t.pnl > 0) {
        win += t.pnl;
        wins++;
      } else loss -= t.pnl;
    }
    const months = [...new Set(trades.map((t) => monthOf(t.t)))].sort().reverse();
    const cell = (m: string | null, s: string | null) => {
      const list = trades.filter((t) => (m === null || monthOf(t.t) === m) && (s === null || t.symbol === s));
      return { n: list.length, pnl: list.reduce((a, t) => a + t.pnl, 0), wins: list.filter((t) => t.pnl > 0).length };
    };
    // The account rules, played over the same trades: fixed size as tested,
    // then the tiers, then the daily stop, then both.
    const raw = per.flatMap(({ e, c, feeTicks }) =>
      c.trades.map((row) => {
        const tr = fromRow(row, e.result!.tickValue);
        return { ...tr, ticks: tr.ticks - feeTicks };
      })
    );
    const lots = per[0]?.e.result!.settings.lots ?? 2;
    const dd = account.ddLimit ?? null;
    const accountRuns = [
      { label: `${lots} lots fixes`, run: runAccount(raw, lots, { ...account, tiers: null, dailyStop: null, ddLimit: dd }) },
      ...(account.tiers ? [{ label: `Paliers ${tiersText(account.tiers)}`, run: runAccount(raw, lots, { ...account, dailyStop: null, ddLimit: dd }) }] : []),
      ...(account.dailyStop !== null
        ? [{ label: `${lots} lots fixes + limite jour −${account.dailyStop} $`, run: runAccount(raw, lots, { ...account, tiers: null, ddLimit: dd }) }]
        : []),
      ...(account.tiers && account.dailyStop !== null ? [{ label: "Paliers + limite jour (tes règles)", run: runAccount(raw, lots, account) }] : []),
    ];
    const budget = pairBudget(account);
    return { per, trades, pnl: eq, maxDD, pf: loss > 0 ? win / loss : win > 0 ? null : 0, winRate: trades.length ? wins / trades.length : 0, months, cell, accountRuns, budget, span: per.length ? Math.max(...per.map(({ e }) => spanMonths(e.result!))) : 1 };
  }, [analysed, account]);
  /** The firm's share of each month on one account, oldest first, and in all. */
  const shares = useMemo(() => {
    const months = [...general.months].sort();
    const cuts = firmShares(months.map((m) => general.cell(m, null).pnl), account.split ?? null);
    return { byMonth: new Map(months.map((m, i) => [m, cuts[i]])), total: cuts.reduce((a, c) => a + c, 0) };
  }, [general, account.split]);

  const sel = analysed.find((e) => e.symbol === view) ?? null;
  const selCfg = sel ? retained(sel) : null;

  const [tab, setTab] = useState<"results" | "rules">("results");
  const [rulesDetail, setRulesDetail] = useState(true);
  const months = monthsBetween(
    Math.min(...analysed.map((e) => e.result!.from)),
    Math.max(...analysed.map((e) => e.result!.to))
  );
  const lots = general.per[0]?.e.result!.settings.lots ?? 2;
  const perMonth = general.pnl / general.span;
  const ddRun = general.accountRuns[0]?.run.propDD ?? 0;
  const positiveMonths = general.months.filter((m) => general.cell(m, null).pnl > 0).length;

  return (
    <div>
      {/* ---- Title, and the account the reports are read on ---- */}
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <PageTitle>Backtesting</PageTitle>
          <div style={{ fontSize: 14, color: muted, marginTop: 4 }}>
            Tes niveaux rejoués sur l&apos;historique Databento · meilleure entrée, meilleur SL, meilleurs TP
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 8px 8px 14px", borderRadius: 10, border: "1px solid oklch(0.84 0.17 196 / 0.22)", background: "oklch(0.17 0.03 250 / 0.62)" }}>
          <span style={{ ...label, fontSize: 11, marginRight: 4 }}>Ton compte</span>
          {[
            `${account.copies ?? 1} compte${(account.copies ?? 1) > 1 ? "s" : ""}`,
            account.ddLimit ? `DD ${account.ddLimit} $` : null,
            account.dailyStop !== null ? `−${account.dailyStop} $ / jour` : null,
            account.maxContracts ? `${account.maxContracts} contrats` : null,
            account.maxLossPerTrade ? `${account.maxLossPerTrade} $ max / trade` : null,
          ]
            .filter(Boolean)
            .map((p) => (
              <span key={p} style={{ ...mono, fontSize: 12, padding: "5px 9px", borderRadius: 6, background: "oklch(0.23 0.03 250)", color: "oklch(0.88 0.02 250)" }}>
                {p}
              </span>
            ))}
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 7, border: `1px solid ${accentColor}`, background: rulesOpen ? accentSoft : "transparent", color: accentColor }}
          >
            {rulesOpen ? "Fermer" : "Modifier"}
          </button>
        </div>
      </header>

      {rulesOpen && (
        <div style={{ ...glassCard, marginBottom: 22 }}>
          <div style={{ fontSize: 12.5, color: muted }}>
            Les règles de ton compte prop firm, appliquées aux rapports sur les trades de toutes les paires ensemble. Les règles de séance (horaires,
            news, heures exclues, 1 trade par jour) sont appliquées pendant l&apos;analyse.
          </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginTop: 14, fontSize: 13 }}>
          <RuleRow on={account.tiers !== null} onToggle={(v) => updateAccount({ ...account, tiers: v ? parseTiers(tiersDraft) : null })} label="Paliers de lots (gain du compte : lots)">
            <input
              value={tiersDraft}
              disabled={account.tiers === null}
              onChange={(e) => {
                setTiersDraft(e.target.value);
                const t = parseTiers(e.target.value);
                if (t.length) updateAccount({ ...account, tiers: t });
              }}
              style={{ ...smallField, width: 170 }}
            />
          </RuleRow>
          <RuleRow on={!!account.ddLimit} onToggle={(v) => updateAccount({ ...account, ddLimit: v ? 2000 : null })} label="Prop firm : drawdown qui fait sauter le compte ($)">
            <input type="number" min={1} value={account.ddLimit ?? 2000} disabled={!account.ddLimit} onChange={(e) => updateAccount({ ...account, ddLimit: Number(e.target.value) })} style={{ ...smallField, width: 80 }} />
            <select value={account.ddMode ?? "eod"} disabled={!account.ddLimit} onChange={(e) => updateAccount({ ...account, ddMode: e.target.value as "eod" | "intraday" })} style={{ ...smallField, width: 150 }}>
              <option value="eod">suiveur fin de journée</option>
              <option value="intraday">suiveur intraday</option>
            </select>
          </RuleRow>
          <RuleRow on={!!account.target} onToggle={(v) => updateAccount({ ...account, target: v ? 3000 : null })} label="Prop firm : objectif de profit ($) / contrats max ouverts">
            <input type="number" min={1} value={account.target ?? 3000} disabled={!account.target} onChange={(e) => updateAccount({ ...account, target: Number(e.target.value) })} style={{ ...smallField, width: 80 }} />
            <input type="number" min={1} value={account.maxContracts ?? 5} onChange={(e) => updateAccount({ ...account, maxContracts: Math.max(1, Number(e.target.value)) })} style={smallField} />
          </RuleRow>
          <RuleRow on={!!account.ddLimit} onToggle={() => {}} label="Paires sur le compte / réserve (%)">
            <input type="number" min={1} value={account.pairs ?? 5} disabled={!account.ddLimit} onChange={(e) => updateAccount({ ...account, pairs: Math.max(1, Number(e.target.value)) })} style={smallField} />
            <input type="number" min={0} max={90} value={account.safety ?? 30} disabled={!account.ddLimit} onChange={(e) => updateAccount({ ...account, safety: Number(e.target.value) })} style={smallField} />
            <span style={{ ...mono, fontSize: 11.5, color: accentColor, alignSelf: "center" }}>
              {pairBudget(account) ? `= ${pairBudget(account)!.toFixed(0)} $ par paire` : ""}
            </span>
          </RuleRow>
          <RuleRow on onToggle={() => {}} label="Comptes copiés (master + slaves)">
            <input
              type="number"
              min={1}
              max={20}
              value={account.copies ?? 1}
              onChange={(e) => updateAccount({ ...account, copies: Math.max(1, Math.round(Number(e.target.value))) })}
              style={smallField}
            />
            <span style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", alignSelf: "center" }}>mêmes trades sur chaque compte · les limites restent celles d&apos;un compte</span>
          </RuleRow>
          <RuleRow on={!!account.split} onToggle={(v) => updateAccount({ ...account, split: v ? { from: 30000, firm: 10 } : null })} label="Partage des gains : la firme prend (%) au-delà de ($) par compte">
            <input type="number" min={0} max={100} value={account.split?.firm ?? 10} disabled={!account.split} onChange={(e) => updateAccount({ ...account, split: { from: account.split?.from ?? 30000, firm: Number(e.target.value) } })} style={smallField} />
            <input type="number" min={0} value={account.split?.from ?? 30000} disabled={!account.split} onChange={(e) => updateAccount({ ...account, split: { firm: account.split?.firm ?? 10, from: Number(e.target.value) } })} style={{ ...smallField, width: 80 }} />
          </RuleRow>
          <RuleRow
            on={!!account.fees}
            onToggle={(v) => updateAccount({ ...account, fees: v ? DEFAULT_ACCOUNT.fees : null })}
            label="Commission par contrat ($) — déduite de chaque trade"
          >
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={account.fees?.perSide ? "side" : "rt"}
                disabled={!account.fees}
                onChange={(e) => account.fees && updateAccount({ ...account, fees: { ...account.fees, perSide: e.target.value === "side" } })}
                style={{ ...smallField, width: "auto" }}
              >
                <option value="side">par côté (entrée + sortie)</option>
                <option value="rt">aller-retour</option>
              </select>
              {Object.entries(account.fees?.bySymbol ?? DEFAULT_ACCOUNT.fees!.bySymbol).map(([sym, v]) => (
                <label key={sym} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11.5 }}>
                  {sym}
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={v}
                    disabled={!account.fees}
                    onChange={(e) => account.fees && updateAccount({ ...account, fees: { ...account.fees, bySymbol: { ...account.fees.bySymbol, [sym]: Number(e.target.value) } } })}
                    style={{ ...smallField, width: 58 }}
                  />
                </label>
              ))}
            </span>
          </RuleRow>
          <RuleRow on={!!account.wholeLots} onToggle={(v) => updateAccount({ ...account, wholeLots: v })} label="Lots entiers, pas de micros">
            <span style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)" }}>le plan propose 1, 2 ou 3 lots par paire</span>
          </RuleRow>
          <RuleRow on={!!account.maxLossPerTrade} onToggle={(v) => updateAccount({ ...account, maxLossPerTrade: v ? 500 : null })} label="Perte max par trade, stop touché ($)">
            <input type="number" min={1} value={account.maxLossPerTrade ?? 500} disabled={!account.maxLossPerTrade} onChange={(e) => updateAccount({ ...account, maxLossPerTrade: Number(e.target.value) })} style={{ ...smallField, width: 80 }} />
          </RuleRow>
          <RuleRow on={account.dailyStop !== null} onToggle={(v) => updateAccount({ ...account, dailyStop: v ? 500 : null })} label="Perte max par jour, latente comprise ($) — ta limite (prop firm : 1 000)">
            <input type="number" min={1} value={account.dailyStop ?? 500} disabled={account.dailyStop === null} onChange={(e) => updateAccount({ ...account, dailyStop: Number(e.target.value) })} style={smallField} />
          </RuleRow>
        </div>
        </div>
      )}

      {/* ---- Results or rules ---- */}
      <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.3 0.03 250 / 0.7)", marginBottom: 22 }}>
        {(
          [
            ["results", "Résultats"],
            ["rules", "Règles"],
          ] as const
        ).map(([k, text]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            style={{
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 16px",
              marginBottom: -1,
              background: "transparent",
              border: 0,
              borderBottom: `2px solid ${tab === k ? accentColor : "transparent"}`,
              color: tab === k ? "oklch(0.96 0.0068 250)" : muted,
              textShadow: tab === k ? "0 0 12px oklch(0.84 0.17 196 / 0.4)" : undefined,
            }}
          >
            {text}
          </button>
        ))}
      </div>

      {analysed.length === 0 && (
        <div style={{ ...glassCard, fontSize: 13.5, color: muted }}>
          Aucun rapport pour l&apos;instant. L&apos;analyse se fait hors du site (scripts/databento-analyse.ts) et ses rapports sont chargés au
          démarrage du serveur.
        </div>
      )}

      {analysed.length > 0 && tab === "rules" && (
        <section>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Règles communes</h2>
              <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>Les mêmes pour toutes les paires</div>
            </div>
            <button type="button" onClick={() => setRulesDetail((o) => !o)} aria-expanded={rulesDetail} style={ghostButton}>
              {rulesDetail ? "Masquer les détails" : "Afficher les détails"}
            </button>
          </div>
          <GeneralRules r={general.per[0].e.result!} account={account} symbols={general.per.map(({ e }) => e.symbol)} detail={rulesDetail} />
          <PairRules per={general.per} />
        </section>
      )}

      {analysed.length > 0 && tab === "results" && (
        <>
          <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 4, borderRadius: 10, background: "oklch(0.16 0.03 250 / 0.7)", border: "1px solid oklch(0.3 0.03 250 / 0.6)", width: "fit-content", maxWidth: "100%", marginBottom: 22 }}>
            {[{ k: "general", text: "Vue d’ensemble" }, ...analysed.map((e) => ({ k: e.symbol, text: e.symbol }))].map(({ k, text }) => {
              const on = view === k || (k === "general" && !sel);
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setView(k)}
                  style={{
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: "7px 13px",
                    borderRadius: 7,
                    border: 0,
                    ...(k === "general" ? {} : mono),
                    background: on ? accentColor : "transparent",
                    color: on ? "oklch(0.14 0.03 250)" : "oklch(0.78 0.02 250)",
                    boxShadow: on ? neonGlow(accentColor, 1) : undefined,
                  }}
                >
                  {text}
                </button>
              );
            })}
          </div>

          {view === "general" || !sel || !selCfg ? (
            <>
              <section style={kpiGrid}>
                <Kpi
                  title="P&L par mois"
                  value={general.months.length ? fmtUsd(perMonth) : "—"}
                  color={tone(general.pnl)}
                  hint={`par compte · ${positiveMonths} / ${general.months.length} mois positifs`}
                  bar={general.months.length ? { pct: (positiveMonths / general.months.length) * 100, color: winColor } : undefined}
                />
                {(account.copies ?? 1) > 1 && general.months.length > 0 && (
                  <Kpi
                    title={`Sur ${account.copies} comptes`}
                    value={fmtUsd(perMonth * account.copies!)}
                    color={tone(general.pnl)}
                    hint={`réaliste : ${fmtUsd(perMonth * account.copies! * 0.5)} à ${fmtUsd(perMonth * account.copies! * 0.65)}`}
                  />
                )}
                <Kpi
                  title="Gagnants"
                  value={pct(general.winRate)}
                  hint={`${(general.trades.length / general.span).toFixed(0)} trades par mois`}
                  bar={{ pct: general.winRate * 100, color: winColor }}
                />
                <Kpi
                  title="Drawdown max"
                  value={fmtUsd(-ddRun)}
                  color={lossColor}
                  hint={account.ddLimit ? `${Math.round((ddRun / account.ddLimit) * 100)} % de la limite de ${account.ddLimit} $ · ${DD_MODE_TEXT[account.ddMode ?? "eod"]}` : DD_MODE_TEXT[account.ddMode ?? "eod"]}
                  bar={account.ddLimit ? { pct: (ddRun / account.ddLimit) * 100, color: lossColor } : undefined}
                />
                <Kpi title="Pire journée" value={fmtUsd(general.accountRuns[0]?.run.worstDay ?? 0)} color={lossColor} hint={`limite ${account.dailyStop ?? "—"} $`} />
              </section>

              <section style={{ ...card, marginBottom: 22 }}>
                <h2 style={cardTitle}>P&amp;L par mois</h2>
                <div style={{ fontSize: 12, color: muted, marginTop: 3, marginBottom: 18 }}>
                  Toutes paires, par compte, à {lots} lots · frais déduits
                </div>
                <MonthBars
                  bars={months.map((m) => {
                    const c = general.cell(m, null);
                    return {
                      key: m,
                      value: c.n ? c.pnl : null,
                      tip: c.n ? `${monthLabel(m)} : ${fmtUsd(c.pnl)} · ${c.n} trades · ${pct(c.wins / c.n)}` : `${monthLabel(m)} : aucun trade`,
                    };
                  })}
                />
              </section>

              <button type="button" onClick={() => setDetail((o) => !o)} style={ghostButton}>
                {detail ? "Masquer le détail" : "Voir le détail par paire et par mois"}
              </button>
              {detail && (
                <section style={{ ...card, marginTop: 14 }}>
                  <h2 style={cardTitle}>Par paire</h2>
                  <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th style={th}>Paire</th>
                        <th style={th}>PnL par mois</th>
                        <th style={th}>Trades par mois</th>
                        <th style={th}>Gagnants</th>
                        <th style={th}>Drawdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {general.per.map(({ e, c }) => {
                        const n = spanMonths(e.result!);
                        return (
                          <tr key={e.symbol} style={{ cursor: "pointer" }} onClick={() => setView(e.symbol)}>
                            <td style={{ ...td, fontWeight: 700 }}>{e.symbol}</td>
                            <td style={{ ...td, color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl / n)}</td>
                            <td style={td}>{(c.n / n).toFixed(1)}</td>
                            <td style={td}>{pct(c.winRate)}</td>
                            <td style={{ ...td, color: lossColor }}>{fmtUsd(-(c.propDD ?? c.maxDD))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <h2 style={{ ...cardTitle, marginTop: 24 }}>Mois par mois</h2>
                  <div style={{ overflowX: "auto", marginTop: 10 }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={th}>Mois</th>
                          {general.per.map(({ e }) => (
                            <th key={e.symbol} style={th}>{e.symbol}</th>
                          ))}
                          <th style={{ ...th, color: accentColor }}>Combiné</th>
                          {(account.copies ?? 1) > 1 && <th style={{ ...th, color: accentColor }}>Sur {account.copies} comptes</th>}
                          {account.split && <th style={{ ...th, color: accentColor }}>Pour toi, après partage</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...general.months, null].map((m) => {
                          const tot = general.cell(m, null);
                          return (
                            <tr key={m ?? "total"} style={m === null ? { background: "oklch(0.84 0.17 196 / 0.07)" } : undefined}>
                              <td style={{ ...td, fontFamily: "inherit", fontWeight: m === null ? 700 : undefined }}>{m ? monthLabel(m) : "Total"}</td>
                              {general.per.map(({ e }) => {
                                const c = general.cell(m, e.symbol);
                                return (
                                  <td key={e.symbol} style={td}>
                                    {c.n ? (
                                      <>
                                        <div style={{ color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl)}</div>
                                        <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)" }}>{c.n} trades · {pct(c.wins / c.n)}</div>
                                      </>
                                    ) : (
                                      <span style={{ color: "oklch(0.4 0.02 250)" }}>—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td style={td}>
                                <div style={{ color: tone(tot.pnl), fontWeight: 700, fontSize: 14 }}>{fmtUsd(tot.pnl)}</div>
                                <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)" }}>{tot.n} trades · {tot.n ? pct(tot.wins / tot.n) : "—"}</div>
                              </td>
                              {(account.copies ?? 1) > 1 && (
                                <td style={td}>
                                  <div style={{ color: tone(tot.pnl), fontWeight: 700, fontSize: 14 }}>{fmtUsd(tot.pnl * account.copies!)}</div>
                                  <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)" }}>{fmtUsd(tot.pnl)} × {account.copies}</div>
                                </td>
                              )}
                              {account.split &&
                                (() => {
                                  const cut = m === null ? shares.total : shares.byMonth.get(m) ?? 0;
                                  const copies = account.copies ?? 1;
                                  return (
                                    <td style={td}>
                                      <div style={{ color: tone(tot.pnl - cut), fontWeight: 700, fontSize: 14 }}>{fmtUsd((tot.pnl - cut) * copies)}</div>
                                      <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)" }}>{cut > 0 ? `firme −${fmtUsd(cut * copies).replace("+", "")}` : "100 % pour toi"}</div>
                                    </td>
                                  );
                                })()}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            <SymbolReport key={sel.symbol} entry={sel} cfg={selCfg} account={account} onChoose={(k) => choisir(sel.symbol, k)} />
          )}
        </>
      )}
    </div>
  );
}

/* ---- Pieces of the page ------------------------------------------------------ */

const muted = "oklch(0.62 0.034 250)";
const card: React.CSSProperties = { ...glassCard, padding: 20 };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: 0 };
const kpiGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 22 };
const ghostButton: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 7,
  border: "1px solid oklch(0.34 0.04 250)",
  background: "oklch(0.18 0.03 250)",
  color: "oklch(0.85 0.02 250)",
};
/** The two ways into a level: buying a fall onto it, selling a rise onto it. */
const buyColor = accentColor;
const sellColor = "oklch(0.8 0.14 55)";

/** Every month from the first to the last, the empty ones included: a month without a trade is still a month. */
function monthsBetween(from: number, to: number) {
  const out: string[] = [];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return out;
  const a = new Date(from), b = new Date(to);
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth()); m === 11 ? (y++, (m = 0)) : m++)
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  return out;
}

/** A sum without the dollar, spaced by thousands: the figures over the bars. */
const short = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function Kpi({ title, value, hint, color, bar }: { title: string; value: string; hint?: string; color?: string; bar?: { pct: number; color: string } }) {
  return (
    <div style={card}>
      <div style={{ ...label, fontSize: 11.5 }}>{title}</div>
      <div style={{ ...mono, fontSize: 26, fontWeight: 600, marginTop: 10, color: color ?? "oklch(0.96 0.0068 250)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {bar && (
        <div style={{ height: 5, borderRadius: 4, background: "oklch(0.26 0.03 250)", overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, bar.pct)).toFixed(1)}%`, background: bar.color, borderRadius: "inherit", boxShadow: neonGlow(bar.color, 1) }} />
        </div>
      )}
      {hint && <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

/** Months as bars, gains up and losses down from one line; clickable when a month opens onto its trades. */
function MonthBars({ bars, selected, onPick }: { bars: { key: string; value: number | null; tip: string }[]; selected?: string | null; onPick?: (key: string) => void }) {
  const up = Math.max(0, ...bars.map((b) => b.value ?? 0));
  const down = Math.max(0, ...bars.map((b) => -(b.value ?? 0)));
  const scale = 130 / Math.max(1, up + down);
  const value = (v: number) => <span style={{ ...mono, fontSize: 10, color: "oklch(0.86 0.02 250)", whiteSpace: "nowrap" }}>{short(v)}</span>;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${bars.length}, minmax(34px, 1fr))`, gap: 5 }}>
        {bars.map((b) => {
          const v = b.value;
          const on = selected === b.key;
          const style: React.CSSProperties = {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "4px 0 6px",
            borderRadius: 7,
            border: 0,
            font: "inherit",
            color: "inherit",
            cursor: onPick && v !== null ? "pointer" : "default",
            background: on ? accentSoft : "transparent",
          };
          const inner = (
            <>
              <span style={{ height: up * scale + 16, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 3, width: "100%" }}>
                {v !== null && v >= 0 && value(v)}
                {v !== null && v > 0 && <span style={{ display: "block", width: "60%", maxWidth: 30, height: Math.max(2, v * scale), borderRadius: "3px 3px 0 0", background: winColor, boxShadow: neonGlow(winColor, 1) }} />}
              </span>
              <span style={{ display: "block", width: "100%", height: 1, background: "oklch(0.4 0.03 250)" }} />
              <span style={{ height: down * scale + 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%" }}>
                {v !== null && v < 0 && <span style={{ display: "block", width: "60%", maxWidth: 30, height: Math.max(2, -v * scale), borderRadius: "0 0 3px 3px", background: lossColor, boxShadow: neonGlow(lossColor, 1) }} />}
                {v !== null && v < 0 && value(v)}
              </span>
              <span style={{ fontSize: 10.5, marginTop: 4, color: on ? "oklch(0.96 0.0068 250)" : muted, whiteSpace: "nowrap" }}>{MOIS[Number(b.key.slice(5, 7)) - 1]}</span>
            </>
          );
          return onPick ? (
            <button key={b.key} type="button" title={b.tip} aria-pressed={on} disabled={v === null} onClick={() => onPick(b.key)} style={style}>
              {inner}
            </button>
          ) : (
            <div key={b.key} title={b.tip} style={style}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One rule: what to do, in a few words, and the detail under it. */
type Rule = { k: string; main: React.ReactNode; detail?: React.ReactNode };

/** A group of rules on its own card: the moment of the day they belong to. */
function RuleCard({ num, title, rules, detail }: { num: number; title: string; rules: (Rule | null | false | undefined)[]; detail: boolean }) {
  return (
    <div style={{ ...card, padding: "18px 18px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span aria-hidden style={{ ...mono, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: accentSoft, color: accentColor }}>
          {num}
        </span>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
      </div>
      {rules
        .filter((x): x is Rule => !!x)
        .map((x) => (
          <div key={x.k} style={{ padding: "10px 0", borderTop: "1px solid oklch(0.27 0.03 250 / 0.8)" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: muted }}>{x.k}</div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginTop: 3 }}>{x.main}</div>
            {detail && x.detail && <div style={{ fontSize: 12, color: "oklch(0.7 0.02 250)", lineHeight: 1.45, marginTop: 3 }}>{x.detail}</div>}
          </div>
        ))}
    </div>
  );
}

/** What every pair is traded under, read off the reports. */
function GeneralRules({ r, account, symbols, detail }: { r: SymbolResult; account: AccountRules; symbols: string[]; detail: boolean }) {
  const bo = r.rules?.blackout;
  const h = r.rules?.hours;
  const lots = r.settings.lots;
  const perDay = r.rules?.maxPerDay ?? 1;
  const positions = account.maxContracts ? Math.floor(account.maxContracts / lots) : null;
  const fill = r.settings.fill;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
      <RuleCard
        num={1}
        title="Préparer la séance"
        detail={detail}
        rules={[
          h && { k: "Horaires", main: `Ordres de ${h[0]}h à ${h[1]}h Chicago`, detail: "Sauf les heures exclues indiquées pour la paire" },
          {
            k: "News",
            main: bo ? `Pas d'ordre ${bo.before} min avant → ${bo.after} min après` : "Pas de blackout",
            detail: bo ? (bo.all ? "Chaque news 3 étoiles des devises de la paire" : "CPI, NFP, Fed et la banque centrale de la paire") : undefined,
          },
          r.rules?.minApproach
            ? {
                k: "Approche",
                main: `Au moins ${fmtDistBySymbol(r.rules.minApproach, symbols)} vers le niveau depuis 17h`,
                detail: "Sinon pas d'ordre sur ce niveau. Un niveau traversé dans la séance ne se trade plus dans l'autre sens.",
              }
            : null,
          { k: "Ticks", main: "1 tick = une ligne du DOM", detail: tickNote(symbols, (s) => CONTRACTS[s]?.tickSize).replace(/^1 tick = une ligne du DOM — /, "") },
        ]}
      />
      <RuleCard
        num={2}
        title="Entrer"
        detail={detail}
        rules={[
          { k: "Sens", main: "Achat si le prix descend sur le niveau, vente s'il monte dessus" },
          {
            k: "Ordre",
            main: `Limite 1 tick avant le niveau · ${lots} lots · SL attaché`,
            detail: "Rempli dès que le prix touche le niveau, quelle que soit ta place dans la file (écart propre à la paire s'il est indiqué)",
          },
          {
            k: "Un trade par paire",
            main: `${perDay} trade par jour et par paire`,
            detail: "Un ordre par niveau valable : dès que l'un est rempli, annule les autres de cette paire pour la journée. Les autres paires gardent les leurs.",
          },
          { k: "Nouvelle touche", main: `Le prix doit s'éloigner de ${fmtDistBySymbol(r.settings.rearm, symbols)} puis revenir`, detail: "Avant qu'un niveau déjà touché compte de nouveau" },
          {
            k: "Déjà touché hors horaires",
            main: "Pas d'ordre sur un niveau déjà touché la nuit, à une heure exclue ou pendant une news",
            detail: `Tant que le prix ne s'en est pas éloigné de ${fmtDistBySymbol(r.settings.rearm, symbols)}. Backtest : ces trades gagnent 1 fois sur 3 et perdent ≈ 13 500 $ par an.`,
          },
        ]}
      />
      <RuleCard
        num={3}
        title="Gérer le trade"
        detail={detail}
        rules={[
          { k: "TP1", main: `${lots / 2} lot au TP1, stop au prix d'entrée` },
          { k: "Runner", main: "L'autre lot en trailing dès TP1, à la distance du TP1", detail: "Sorti au TP2 de la paire s'il l'atteint" },
          { k: "Durée", main: `${r.settings.maxHours} h au plus en position`, detail: r.rules?.flatAt ? `Tout clôturé à ${r.rules.flatAt}h Chicago` : undefined },
        ]}
      />
      <RuleCard
        num={4}
        title="Protéger le compte"
        detail={detail}
        rules={[
          r.settings.maxLossPerTrade ? { k: "Par trade", main: `Jamais plus de ${r.settings.maxLossPerTrade} $ perdus` } : null,
          account.dailyStop ? { k: "Par jour", main: `−${account.dailyStop} $ : tout fermer, journée finie`, detail: "Positions ouvertes comprises" } : null,
          positions ? { k: "En même temps", main: `${positions} positions au plus`, detail: `${account.maxContracts} contrats` } : null,
          account.ddLimit ? { k: "Drawdown", main: `${account.ddLimit} $ max`, detail: account.ddMode === "eod" ? "Suiveur fin de journée" : "Suiveur intraday" } : null,
          fill && {
            k: "Backtest",
            main: "Compté prudemment",
            detail: `Un ordre n'est compté rempli que si le prix le dépasse de ${fmtDist(r.symbol, fill.through)}${fill.cancelOnMiss ? ", annulé s'il a été touché sans être rempli puis que le prix est allé au TP1" : ""}`,
          },
        ]}
      />
    </div>
  );
}

/** Every pair's own settings on one table. */
function PairRules({ per }: { per: { e: Entry; c: ConfigStats }[] }) {
  return (
    <section style={{ ...card, marginTop: 22, overflowX: "auto" }}>
      <h2 style={cardTitle}>Règles par paire</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
        <thead>
          <tr>
            <th style={th}>Paire</th>
            <th style={th}>Niveaux</th>
            <th style={th}>Stop</th>
            <th style={th}>TP1 = trailing · TP2</th>
            <th style={th}>Pas d&apos;ordre</th>
          </tr>
        </thead>
        <tbody>
          {per.map(({ e, c }) => {
            const r = e.result!;
            const hours = r.rules?.excludeHours ?? [];
            const levels = Object.entries(c.zones).sort(([a], [b]) => Number(a) - Number(b));
            return (
              <tr key={e.symbol}>
                <td style={{ ...td, fontWeight: 700 }}>{e.symbol}</td>
                <td style={{ ...td, whiteSpace: "normal" }}>
                  {levels.map(([z, b], i) => (
                    <span key={z} style={{ color: b.pnl > 0 ? undefined : lossColor }}>
                      {i ? " · " : ""}
                      {fmtZone(Number(z), e.symbol)}
                      {b.pnl > 0 ? "" : " ✗"}
                    </span>
                  ))}
                </td>
                <td style={td}>
                  {fmtDist(e.symbol, c.cfg.sl)} ({(c.cfg.sl * r.tickValue * r.settings.lots).toFixed(0)} $)
                </td>
                <td style={td}>
                  {fmtDist(e.symbol, c.cfg.tp1)}
                  {kindOf(c.cfg) === "tp1trail" && c.cfg.tp2 > c.cfg.tp1 && <div style={{ color: muted }}>TP2 {fmtDist(e.symbol, c.cfg.tp2)}</div>}
                </td>
                <td style={td}>{hours.length ? hoursText(hours) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Hours kept out, consecutive ones as one span: [2, 7, 8] → "2h–3h, 7h–9h". */
function hoursText(hours: number[]) {
  const spans: [number, number][] = [];
  for (const h of [...hours].sort((x, y) => x - y)) {
    const last = spans[spans.length - 1];
    if (last && last[1] === h) last[1] = h + 1;
    else spans.push([h, h + 1]);
  }
  return spans.map(([a, b]) => `${a}h–${b}h`).join(", ");
}

const chicagoTime = new Intl.DateTimeFormat("fr-CH", { timeZone: "America/Chicago", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** How a trade ended, for the runner-trailed exit the plan uses. */
const OUT_TEXT: Record<string, string> = {
  SL: "Stop",
  TP1: "TP1, runner sorti à l'entrée",
  TR: "TP1 + trailing",
  TP2: "TP1 + TP2",
  TO: "Clôturé (durée max)",
};

/** The order on a line: stop under the entry, TP1 and TP2 over it, each at its distance. */
function Ladder({ sl, tp1, tp2, trail }: { sl: number; tp1: number; tp2: number | null; trail: number }) {
  const range = sl + Math.max(tp1, tp2 ?? 0);
  const at = (x: number) => `${(((x + sl) / range) * 100).toFixed(1)}%`;
  const marks: [number, string, boolean][] = [
    [-sl, `SL −${sl}`, true],
    [0, "Entrée", false],
    [tp1, `TP1 +${tp1} · trailing ${trail}`, true],
    ...(tp2 ? [[tp2, `TP2 +${tp2}`, false] as [number, string, boolean]] : []),
  ];
  const text = (s: string) => <span style={{ ...mono, fontSize: 11, color: "oklch(0.86 0.02 250)", whiteSpace: "nowrap" }}>{s}</span>;
  return (
    <div role="img" aria-label={`Stop ${sl} ticks sous l'entrée, TP1 à ${tp1} ticks${tp2 ? `, TP2 à ${tp2} ticks` : ""}`} style={{ position: "relative", height: 58, margin: "22px 30px 20px" }}>
      <div style={{ position: "absolute", top: 25, left: 0, width: at(0), height: 8, borderRadius: "4px 0 0 4px", background: "oklch(0.72 0.27 340 / 0.5)" }} />
      <div style={{ position: "absolute", top: 25, left: at(0), right: 0, height: 8, borderRadius: "0 4px 4px 0", background: "oklch(0.84 0.17 196 / 0.4)" }} />
      {marks.map(([x, s, above], i) => (
        <div
          key={s}
          style={{
            position: "absolute",
            top: 0,
            left: at(x),
            display: "flex",
            flexDirection: "column",
            // The two ends hang inward, so their labels stay on the card.
            ...(i === 0
              ? { transform: "translateX(-1px)", alignItems: "flex-start" }
              : i === marks.length - 1
                ? { transform: "translateX(calc(-100% + 1px))", alignItems: "flex-end" }
                : { transform: "translateX(-50%)", alignItems: "center" }),
          }}
        >
          <div style={{ height: 22, display: "flex", alignItems: "flex-end" }}>{above && text(s)}</div>
          <div style={{ width: 2, height: 14, borderRadius: 1, background: "oklch(0.92 0.01 250)" }} />
          <div style={{ height: 22, display: "flex", alignItems: "flex-start" }}>{!above && text(s)}</div>
        </div>
      ))}
    </div>
  );
}

function SymbolReport({ entry, cfg, account, onChoose }: { entry: Entry; cfg: ConfigStats; account: AccountRules; onChoose: (key: string) => void }) {
  const r = entry.result!;
  const c = cfg.cfg;
  const lots = r.settings.lots;
  const nMonths = spanMonths(r);
  const months = monthsBetween(r.from, r.to);
  const traded = months.filter((m) => cfg.months[m]);
  const [month, setMonth] = useState<string | null>(traded[traded.length - 1] ?? null);
  const tick = r.tickSize ?? CONTRACTS[r.symbol]?.tickSize;
  const price = (p: number) => (tick ? fmtPrice(p, r.symbol, tick) : String(p));
  const money = r.tickValue * lots;
  const levels = Object.entries(cfg.zones).sort(([a], [b]) => Number(a) - Number(b));
  const hours = r.rules?.excludeHours ?? [];
  const hasTp2 = kindOf(c) === "tp1trail" && c.tp2 > c.tp1;
  const dd = cfg.propDD ?? cfg.maxDD;
  const entryText = c.offset === 0 ? "sur le niveau" : `${fmtDist(r.symbol, Math.abs(c.offset))} ${c.offset > 0 ? "avant le" : "au-delà du"} niveau`;
  const rows = month ? cfg.trades.filter((t) => monthOf(t[0] * 60000) === month) : [];
  const mb = month ? cfg.months[month] : null;
  const priceCols = hasTp2 ? 5 : 4;
  const priceGrid = `96px repeat(${priceCols * 2}, minmax(0, 1fr))`;
  const tradeGrid = "1.3fr 0.7fr 1.4fr 0.8fr 0.8fr 1.6fr 0.6fr 0.5fr 0.7fr";
  const cfgGrid = "96px 0.6fr 1.6fr 0.8fr 1.5fr 0.8fr 0.6fr 0.7fr 0.6fr";
  const cfgMax = Math.max(1, ...r.top.map((x) => x.pnl));

  return (
    <>
      <section style={kpiGrid}>
        <Kpi title={`P&L par mois · ${r.symbol}`} value={fmtUsd(cfg.pnl / nMonths)} color={tone(cfg.pnl)} hint={`${fmtUsd(cfg.pnl)} sur la période`} />
        <Kpi title="Trades par mois" value={(cfg.n / nMonths).toFixed(1).replace(".", ",")} hint={`ordre ${entryText}`} />
        <Kpi title="Gagnants" value={pct(cfg.winRate)} hint={`TP1 → TP2 : ${c.tp1}${hasTp2 ? ` → ${c.tp2}` : ""} ticks`} bar={{ pct: cfg.winRate * 100, color: winColor }} />
        <Kpi
          title="Drawdown max"
          value={fmtUsd(-dd)}
          color={lossColor}
          hint={account.ddLimit ? `${Math.round((dd / account.ddLimit) * 100)} % de la limite de ${account.ddLimit} $` : "fin de journée"}
          bar={account.ddLimit ? { pct: (dd / account.ddLimit) * 100, color: lossColor } : undefined}
        />
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <article style={{ ...card, flex: "1 1 380px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={cardTitle}>Ta règle {r.symbol}</h2>
            <span style={{ fontSize: 12, color: muted }}>
              Backtest du {fmtDay(r.from)} au {fmtDay(r.to)} · {lots} lots
            </span>
          </div>
          {kindOf(c) === "tp1trail" ? (
            <Ladder sl={c.sl} tp1={c.tp1} tp2={hasTp2 ? c.tp2 : null} trail={c.dist} />
          ) : (
            <div style={{ fontSize: 13, margin: "14px 0" }}>{exitShort(c)}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", rowGap: 12, columnGap: 12, fontSize: 13, paddingTop: 14, borderTop: "1px solid oklch(0.3 0.03 250 / 0.7)" }}>
            <div style={{ color: muted }}>Niveaux</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {levels.map(([z, b]) => {
                const bad = b.pnl <= 0;
                return (
                  <span
                    key={z}
                    title={`${fmtUsd(b.pnl)} sur ${b.n} trades`}
                    style={{
                      ...mono,
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: bad ? "oklch(0.72 0.27 340 / 0.12)" : "oklch(0.23 0.03 250)",
                      color: bad ? lossColor : "oklch(0.88 0.02 250)",
                      border: bad ? "1px dashed oklch(0.72 0.27 340 / 0.5)" : "1px solid transparent",
                    }}
                  >
                    {fmtZone(Number(z), r.symbol)}
                    {bad ? " ✗" : ""}
                  </span>
                );
              })}
            </div>
            <div style={{ color: muted }}>Entrée</div>
            <div>Limite {entryText}</div>
            <div style={{ color: muted }}>Lots</div>
            <div>
              50k : {lots} lots{kindOf(c) === "tp1trail" && lots >= 2 ? ` · ${lots / 2} sort à TP1, ${lots / 2 > 1 ? "les autres suivent" : "l'autre suit"} le trailing` : ""}
            </div>
            <div style={{ color: muted }}>Stop</div>
            <div>
              {fmtDist(r.symbol, c.sl)} <span style={{ color: muted }}>· {(c.sl * r.tickValue * lots).toFixed(0)} $ à {lots} lots</span>
            </div>
            <div style={{ color: muted }}>Pas d&apos;ordre</div>
            <div>
              {hours.length ? hoursText(hours) : "—"} <span style={{ color: muted }}>· Chicago</span>
            </div>
          </div>
        </article>

        <article style={{ ...card, flex: "1.3 1 460px", minWidth: 0 }}>
          <h2 style={cardTitle}>P&amp;L par mois</h2>
          <div style={{ fontSize: 12, color: muted, marginTop: 3, marginBottom: 16 }}>Clique un mois pour voir ses trades</div>
          <MonthBars
            selected={month}
            onPick={setMonth}
            bars={months.map((m) => {
              const b = cfg.months[m];
              return { key: m, value: b ? b.pnl : null, tip: b ? `${monthLabel(m)} : ${fmtUsd(b.pnl)} · ${b.n} trade${b.n > 1 ? "s" : ""} · ${pct(b.wins / b.n)}` : `${monthLabel(m)} : aucun trade` };
            })}
          />
        </article>
      </div>

      {tick && (
        <article style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <h2 style={cardTitle}>Prix par niveau</h2>
            <span style={{ fontSize: 12, color: muted }}>2e rebond : le prix doit s&apos;éloigner jusqu&apos;à ce prix avant que le niveau compte de nouveau</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: hasTp2 ? 900 : 760, display: "flex", flexDirection: "column", gap: 4, ...mono, fontSize: 12.5 }}>
              <div style={{ display: "grid", gridTemplateColumns: priceGrid, gap: "0 8px", padding: "0 10px" }}>
                <div />
                <div style={{ gridColumn: `span ${priceCols}`, fontFamily: "inherit", fontSize: 12, fontWeight: 600, paddingBottom: 6, borderBottom: `2px solid ${buyColor}`, color: buyColor }}>
                  Achat · le prix descend sur le niveau
                </div>
                <div style={{ gridColumn: `span ${priceCols}`, fontSize: 12, fontWeight: 600, padding: "0 0 6px 12px", borderBottom: `2px solid ${sellColor}`, color: sellColor }}>
                  Vente · le prix monte sur le niveau
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: priceGrid, gap: "0 8px", padding: "6px 10px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: muted }}>
                <div>Niveau</div>
                {[0, 1].flatMap((side) =>
                  ["Entrée", "SL", "TP1", ...(hasTp2 ? ["TP2"] : []), "2e rebond"].map((h, i) => (
                    <div key={`${side}${h}`} style={side && !i ? { paddingLeft: 12 } : undefined}>
                      {h}
                    </div>
                  ))
                )}
              </div>
              {levels.map(([zs, b], i) => {
                const z = Number(zs);
                const bad = b.pnl <= 0;
                const side = (dir: 1 | -1) => {
                  const e = z + dir * c.offset * tick;
                  return [e, e - dir * c.sl * tick, e + dir * c.tp1 * tick, ...(hasTp2 ? [e + dir * c.tp2 * tick] : []), z + dir * r.settings.rearm * tick];
                };
                const cells = (dir: 1 | -1) =>
                  side(dir).map((p, k) => (
                    <div
                      key={`${dir}${k}`}
                      style={{
                        fontWeight: k === 0 ? 600 : undefined,
                        color: k === 1 ? lossColor : k === priceCols - 1 ? muted : undefined,
                        ...(dir === -1 && k === 0 ? { paddingLeft: 12, borderLeft: "1px solid oklch(0.32 0.03 250)" } : {}),
                      }}
                    >
                      {price(p)}
                    </div>
                  ));
                return (
                  <div
                    key={zs}
                    style={{
                      display: "grid",
                      gridTemplateColumns: priceGrid,
                      gap: "0 8px",
                      alignItems: "center",
                      padding: "11px 10px",
                      borderRadius: 8,
                      color: "oklch(0.92 0.01 250)",
                      background: i % 2 ? "transparent" : "oklch(0.15 0.03 250 / 0.8)",
                      opacity: bad ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {fmtZone(z, r.symbol)}
                      {bad ? " ✗" : ""}
                    </div>
                    {cells(1)}
                    {cells(-1)}
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      )}

      <article style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h2 style={cardTitle}>Trades · {month ? monthLabel(month) : "—"}</h2>
          <span style={{ fontSize: 12, color: muted }}>{mb ? `${mb.n} trade${mb.n > 1 ? "s" : ""} · ${pct(mb.wins / mb.n)} gagnants · ${fmtUsd(mb.pnl)}` : "Aucun trade"}</span>
        </div>
        {rows.length ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 880 }}>
                <div style={{ display: "grid", gridTemplateColumns: tradeGrid, gap: 10, padding: "0 10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: muted }}>
                  <div>Ouvert</div>
                  <div>Sens</div>
                  <div>Niveau → entrée</div>
                  <div>SL</div>
                  <div>TP1</div>
                  <div>Sortie</div>
                  <div>Fermé</div>
                  <div style={{ textAlign: "right" }}>Ticks</div>
                  <div style={{ textAlign: "right" }}>P&amp;L</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {rows.map((t) => {
                    const [m, ticks, end, , , , zone, dir, out] = t;
                    const known = zone !== undefined && dir !== undefined && tick;
                    const e = known ? zone + dir * c.offset * tick : null;
                    const outcome = out === undefined ? null : OUTCOMES[out];
                    const runner = outcome === "TR" && lots === 2 ? Math.round(ticks * 2 - c.tp1) : null;
                    const color = tone(ticks);
                    return (
                      <div key={m} style={{ display: "grid", gridTemplateColumns: tradeGrid, gap: 10, alignItems: "center", padding: "12px 10px", borderRadius: 8, background: "oklch(0.15 0.03 250 / 0.8)", ...mono, fontSize: 12.5 }}>
                        <div>{chicagoTime.format(m * 60000)}</div>
                        <div>
                          {dir === undefined ? (
                            "—"
                          ) : (
                            <span
                              style={{
                                fontFamily: "var(--font-space-grotesk), sans-serif",
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "3px 9px",
                                borderRadius: 20,
                                background: dir === 1 ? accentSoft : "oklch(0.8 0.14 55 / 0.14)",
                                color: dir === 1 ? buyColor : sellColor,
                              }}
                            >
                              {dir === 1 ? "Achat" : "Vente"}
                            </span>
                          )}
                        </div>
                        <div>
                          {zone === undefined ? "—" : price(zone)} <span style={{ color: muted }}>→</span> {e === null ? "—" : price(e)}
                        </div>
                        <div style={{ color: "oklch(0.78 0.02 250)" }}>{e === null ? "—" : price(e - dir! * c.sl * tick!)}</div>
                        <div style={{ color: "oklch(0.78 0.02 250)" }}>{e === null ? "—" : price(e + dir! * c.tp1 * tick!)}</div>
                        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 13 }}>
                          {outcome === null ? "—" : runner !== null ? `TP1 + trailing (${runner >= 0 ? "+" : "−"}${Math.abs(runner)})` : OUT_TEXT[outcome] ?? outcome}
                        </div>
                        <div style={{ color: "oklch(0.78 0.02 250)" }}>{end === undefined ? "—" : chicagoTime.format(end * 60000).split(" ").pop()}</div>
                        <div style={{ textAlign: "right", color }}>
                          {ticks > 0 ? "+" : ticks < 0 ? "−" : ""}
                          {String(Math.round(Math.abs(ticks) * 100) / 100).replace(".", ",")}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 600, color }}>{fmtUsd(ticks * money)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: muted, marginTop: 10 }}>
              Heures de Chicago · ticks par contrat en moyenne sur les {lots} lots · P&amp;L à {lots} lots, avant frais
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: muted, padding: "18px 0" }}>Aucun trade ce mois-ci.</div>
        )}
      </article>

      <article style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h2 style={cardTitle}>Configs testées</h2>
          <span style={{ fontSize: 12, color: muted }}>Ta config et les {r.top.length - 1} meilleures autres · entrée {fmtOffset(c.offset)} tick · clique pour en retenir une</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 840, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: cfgGrid, gap: 10, padding: "0 12px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: muted }}>
              <div />
              <div>Stop</div>
              <div>Sortie</div>
              <div>Gagnants</div>
              <div>P&amp;L</div>
              <div>DD</div>
              <div>PF</div>
              <div>P&amp;L / DD</div>
              <div>Mois +</div>
            </div>
            {r.top.map((x, i) => {
              const ms = Object.values(x.months);
              const on = x.key === cfg.key;
              return (
                <button
                  key={x.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChoose(x.key)}
                  style={{
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: cfgGrid,
                    gap: 10,
                    alignItems: "center",
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 8,
                    ...mono,
                    fontSize: 12.5,
                    color: "oklch(0.92 0.01 250)",
                    border: `1px solid ${on ? "oklch(0.84 0.17 196 / 0.6)" : "transparent"}`,
                    background: on ? "oklch(0.84 0.17 196 / 0.1)" : "oklch(0.15 0.03 250 / 0.8)",
                  }}
                >
                  <span>
                    {i === 0 ? (
                      <span style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: accentColor, color: "oklch(0.14 0.03 250)" }}>
                        Ta config
                      </span>
                    ) : (
                      <span style={{ color: muted }}>#{i + 1}</span>
                    )}
                  </span>
                  <span>{x.cfg.sl} ticks</span>
                  <span style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}>{exitShort(x.cfg)}</span>
                  <span>{pct(x.winRate)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 64, fontWeight: 600, color: tone(x.pnl) }}>{fmtUsd(x.pnl)}</span>
                    <span style={{ flex: 1, height: 4, borderRadius: 2, background: "oklch(0.26 0.03 250)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${Math.max(0, (x.pnl / cfgMax) * 100).toFixed(1)}%`, background: winColor }} />
                    </span>
                  </span>
                  <span style={{ color: lossColor }}>{fmtUsd(-(x.propDD ?? x.maxDD))}</span>
                  <span>{fmtPfOrInf(x.pf)}</span>
                  <span>{ratioOf(x).toFixed(1).replace(".", ",")}</span>
                  <span>
                    {ms.filter((mm) => mm.pnl > 0).length} / {ms.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </article>
    </>
  );
}
