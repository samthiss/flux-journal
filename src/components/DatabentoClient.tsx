"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, lossColor, winColor } from "@/lib/theme";
import { fieldStyle, fmtOffset, fmtUsd, mono, tone } from "@/components/BacktestUi";
import { ratioOf, kindOf, monthOf, OUTCOMES, sessionDay, trailingDrawdown, type Bucket, type ConfigStats, type SymbolResult } from "@/lib/databento/engine";
import { DEFAULT_TIERS, feeRoundTrip, firmShares, fromRow, pairBudget, parseTiers, runAccount, tiersText, type AccountRules } from "@/lib/databento/account";
import { chooseDatabentoConfig, setTrendPair, setZoneDisabled } from "@/lib/actions/databento";
import { CONTRACTS, newsCurrencies } from "@/lib/contracts";
import { HOURS_WHY } from "@/lib/pairHoursWhy";
import { fmtDist, fmtDistBySymbol, fmtPrice, fmtZone, tickNote } from "@/lib/databento/format";

type Saved = { symbol: string; zones: number[]; result: string | null; chosenKey: string | null; disabled: number[] };
type Entry = { symbol: string; zones: number[]; result: SymbolResult | null; chosenKey: string | null; disabled: number[] };

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
function retainedAll(e: Entry): ConfigStats | null {
  if (!e.result?.top.length) return null;
  return e.result.top.find((c) => c.key === e.chosenKey) ?? e.result.top[0];
}

/** Whether a level is one of those switched off. */
const isOff = (off: number[], z: number | undefined) => z !== undefined && off.some((d) => Math.abs(d - z) < 1e-9);

/**
 * The configuration a symbol is read with, without the trades of the levels
 * switched off: its figures worked out again from the trades that are left.
 */
function retained(e: Entry): ConfigStats | null {
  const c = retainedAll(e);
  if (!c || !e.disabled.length || !e.result) return c;
  const money = e.result.tickValue * e.result.settings.lots;
  const rows = c.trades.filter((t) => !isOff(e.disabled, t[6]));
  const months: Record<string, Bucket> = {};
  let netTicks = 0, eq = 0, peak = 0, maxDD = 0, wins = 0, win = 0, loss = 0;
  const outs = [0, 0, 0, 0, 0];
  for (const t of rows) {
    const p = t[1] * money;
    netTicks += t[1];
    eq += p;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    if (p > 0) {
      wins++;
      win += p;
    } else loss -= p;
    const m = monthOf(t[0] * 60000);
    const b = (months[m] ??= { n: 0, wins: 0, pnl: 0 });
    b.n++;
    b.pnl += p;
    if (p > 0) b.wins++;
    if (t[8] !== undefined) outs[t[8]]++;
  }
  const propDD = trailingDrawdown(
    rows.filter((t) => t[2] !== undefined).map((t) => ({ start: t[0] * 60000, end: t[2] * 60000, final: t[1] * money, mfe: t[3] * money, mae: t[4] * money, give: t[5] * money })),
    null,
    e.result.settings.ddMode ?? "intraday"
  ).dd;
  const zones = Object.fromEntries(Object.entries(c.zones).filter(([z]) => !isOff(e.disabled, Number(z))));
  return {
    ...c,
    n: rows.length,
    pnl: netTicks * money,
    netTicks: Math.round(netTicks * 10) / 10,
    winRate: rows.length ? wins / rows.length : 0,
    maxDD,
    propDD,
    pf: loss > 0 ? win / loss : win > 0 ? null : 0,
    months,
    zones,
    sl: outs[0],
    tp1: outs[1],
    tp2: outs[2],
    tr: outs[3],
    to: outs[4],
    trades: rows,
  };
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




/** A release that blocks orders: when, whose, what. */
type News = { at: number; currency: string; title: string };

/** The "Trade with Trend" backtest: each pair's trades, [entry minute, exit minute, dir, zone low, zone high, entry, stop, target, ticks, $ net of fees]. */
/** Why a trade: the closes the trend was read from ([session day, close]), the zone's touches, the break, the first return, when the zone was ready — minutes. */
export type TrendWhy = { closes: [number, number][]; touches: number[]; brk: number; ret: number; ready: number };
export type TrendResults = { ranAt: number; rule: string; pairs: { symbol: string; tick: number; from: number; to: number; trades: number[][]; why?: TrendWhy[]; params?: { days: number; exit: number; away?: number; bounce?: number; wide?: boolean; news?: number; sl?: number } }[] };
/** "1,5" — a target in risks, French. */
const rText = (v: number) => String(v).replace(".", ",");

export default function DatabentoClient({
  initial,
  news,
  now,
  berlinShift,
  trend,
  trendOn: trendOnInitial,
}: {
  initial: Saved[];
  news: News[] | null;
  now: number;
  berlinShift: number;
  trend: TrendResults | null;
  trendOn: string[];
}) {
  /** Which strategy the page reports: the yearly levels, the trend trades, or both on one account. */
  const [strat, setStrat] = useState<"zones" | "trend" | "combo">("zones");
  const [trendOn, setTrendOn] = useState<string[]>(trendOnInitial);
  const toggleTrend = (sym: string) => {
    const on = !trendOn.includes(sym);
    setTrendOn((l) => (on ? [...l, sym] : l.filter((x) => x !== sym)));
    startTransition(() => setTrendPair(sym, on));
  };
  const [entries, setEntries] = useState<Entry[]>(() =>
    initial.map((s) => ({ symbol: s.symbol, zones: s.zones, result: parseResult(s.result), chosenKey: s.chosenKey, disabled: s.disabled }))
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

  /** A level switched off or back on: the figures follow at once, the plan and the form on the server. */
  const switchZone = (s: string, z: number, off: boolean) => {
    setEntries((es) => es.map((e) => (e.symbol === s ? { ...e, disabled: off ? [...e.disabled.filter((d) => Math.abs(d - z) > 1e-9), z] : e.disabled.filter((d) => Math.abs(d - z) > 1e-9) } : e)));
    startTransition(() => setZoneDisabled(s, z, off));
  };

  // ---- Reports ------------------------------------------------------------------
  const analysed = entries.filter((e) => retained(e)).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const [view, setView] = useState<string>("general");

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

  const months = monthsBetween(
    Math.min(...analysed.map((e) => e.result!.from)),
    Math.max(...analysed.map((e) => e.result!.to))
  );
  const copies = account.copies ?? 1;
  const perMonth = general.pnl / general.span;
  const ddRun = general.accountRuns[0]?.run.propDD ?? 0;
  const positiveMonths = general.months.filter((m) => general.cell(m, null).pnl > 0).length;
  const screen = view === "rules" ? "rules" : sel && selCfg ? sel.symbol : "all";
  const keys = [{ id: "all", label: "VUE" }, ...analysed.map((e) => ({ id: e.symbol, label: e.symbol })), { id: "rules", label: "RÈGLES" }];

  const kpis: { label: string; value: string; color: string; sub: string }[] =
    screen === "all"
      ? [
          { label: "P&L/MOIS · 1 CPTE", value: short(perMonth), color: tone(perMonth), sub: `${positiveMonths}/${general.months.length} MOIS POSITIFS` },
          ...(copies > 1
            ? [{ label: `SUR ${copies} CPTES`, value: short(perMonth * copies), color: tone(perMonth), sub: `RÉALISTE ${short(perMonth * copies * 0.5)} À ${short(perMonth * copies * 0.65)}` }]
            : []),
          { label: "WIN%", value: (general.winRate * 100).toFixed(1).replace(".", ","), color: TXT, sub: `${(general.trades.length / general.span).toFixed(0)} TRADES / MOIS` },
          {
            label: "MAX DD",
            value: short(-ddRun),
            color: LOSS,
            sub: account.ddLimit ? `${Math.round((ddRun / account.ddLimit) * 100)}% DE LA LIMITE ${account.ddLimit}` : DD_MODE_TEXT[account.ddMode ?? "eod"].toUpperCase(),
          },
          { label: "PIRE JOUR", value: short(general.accountRuns[0]?.run.worstDay ?? 0), color: LOSS, sub: `LIMITE ${account.dailyStop ?? "—"}` },
          { label: `TOTAL ${general.months.length} MOIS`, value: short(general.pnl), color: tone(general.pnl), sub: `${general.trades.length} TRADES · FRAIS DÉDUITS` },
        ]
      : [];

  return (
    <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* ---- The command strip: where you are, the account, the clock ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", background: ORANGE, color: "#000", fontWeight: 700, fontSize: 12 }}>
        <span style={{ padding: "5px 12px", background: "#000", color: ORANGE }}>FLUX</span>
        <span style={{ padding: "5px 12px", borderRight: "1px solid #000" }}>
          {screen === "all" ? "BT ALL <GO>" : screen === "rules" ? "RULES <GO>" : `${screen} CURNCY BT <GO>`}
        </span>
        <span style={{ padding: "5px 12px" }}>BACKTEST DATABENTO</span>
        <span style={{ padding: "5px 12px", marginLeft: "auto" }}>
          {[
            `${copies} CPTE${copies > 1 ? "S" : ""}`,
            account.ddLimit ? `DD ${account.ddLimit}` : null,
            account.dailyStop !== null ? `−${account.dailyStop}/J` : null,
            account.maxContracts ? `${account.maxContracts} CTR` : null,
            account.maxLossPerTrade ? `${account.maxLossPerTrade}/TRADE` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <button
          type="button"
          onClick={() => setRulesOpen((o) => !o)}
          style={{ cursor: "pointer", padding: "5px 12px", border: 0, background: "#000", color: ORANGE, fontWeight: 700, fontSize: 12, fontFamily: "inherit" }}
        >
          {rulesOpen ? "FERMER" : "MODIFIER"}
        </button>
      </div>

      {rulesOpen && (
        <Panel title="COMPTE · RÉGLAGES" right="APPLIQUÉS À TOUS LES RAPPORTS">
          <div style={{ padding: "8px 10px" }}>
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
            <span style={{ fontSize: 11.5, color: "oklch(0.55 0 0)", alignSelf: "center" }}>mêmes trades sur chaque compte · les limites restent celles d&apos;un compte</span>
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
            <span style={{ fontSize: 11.5, color: "oklch(0.55 0 0)" }}>le plan propose 1, 2 ou 3 lots par paire</span>
          </RuleRow>
          <RuleRow on={!!account.maxLossPerTrade} onToggle={(v) => updateAccount({ ...account, maxLossPerTrade: v ? 500 : null })} label="Perte max par trade, stop touché ($)">
            <input type="number" min={1} value={account.maxLossPerTrade ?? 500} disabled={!account.maxLossPerTrade} onChange={(e) => updateAccount({ ...account, maxLossPerTrade: Number(e.target.value) })} style={{ ...smallField, width: 80 }} />
          </RuleRow>
          <RuleRow on={account.dailyStop !== null} onToggle={(v) => updateAccount({ ...account, dailyStop: v ? 500 : null })} label="Perte max par jour, latente comprise ($) — ta limite (prop firm : 1 000)">
            <input type="number" min={1} value={account.dailyStop ?? 500} disabled={account.dailyStop === null} onChange={(e) => updateAccount({ ...account, dailyStop: Number(e.target.value) })} style={smallField} />
          </RuleRow>
        </div>
          </div>
        </Panel>
      )}

      {/* ---- The strategy reported ---- */}
      <div role="toolbar" aria-label="Stratégie" style={{ display: "flex", flexWrap: "wrap", border: "1px solid #2E2E2E" }}>
        {(
          [
            ["zones", "STRATÉGIE ZONES"],
            ["trend", "TRADE WITH TREND"],
            ["combo", "COMBINÉ"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={strat === id}
            onClick={() => setStrat(id)}
            style={{
              cursor: "pointer",
              padding: "6px 14px",
              border: 0,
              borderRight: "1px solid #1A1A1A",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              background: strat === id ? "#1F1608" : "#000",
              boxShadow: strat === id ? `inset 0 -2px 0 ${ORANGE}` : "none",
              color: strat === id ? ORANGE : "#CCC",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {strat === "trend" && <TrendScreens trend={trend} on={trendOn} onToggle={toggleTrend} entries={analysed} account={account} berlinShift={berlinShift} />}
      {strat === "combo" && <ComboReport trend={trend} on={trendOn} per={general.per} account={account} />}

      {strat === "zones" && (
        <>
      {/* ---- The screens, as function keys ---- */}
      <div role="toolbar" aria-label="Écrans" style={{ display: "flex", flexWrap: "wrap", border: "1px solid #2E2E2E" }}>
        {keys.map((k, i) => {
          const on = screen === k.id;
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={on}
              onClick={() => setView(k.id === "all" ? "general" : k.id)}
              style={{
                cursor: "pointer",
                padding: "6px 12px",
                border: 0,
                borderRight: "1px solid #1A1A1A",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                background: on ? ORANGE : "#000",
                color: on ? "#000" : "#CCC",
              }}
            >
              <span style={{ color: on ? "#000" : ORANGE }}>F{i + 1}</span> {k.label}
            </button>
          );
        })}
      </div>

      {analysed.length === 0 && (
        <Panel title="AUCUN RAPPORT">
          <div style={{ padding: "10px", color: DIM }}>
            L&apos;analyse se fait hors du site (scripts/databento-analyse.ts) et ses rapports sont chargés au démarrage du serveur.
          </div>
        </Panel>
      )}

      {analysed.length > 0 && screen === "rules" && (
        <>
          <GeneralRules r={general.per[0].e.result!} account={account} symbols={general.per.map(({ e }) => e.symbol)} detail />
          <PairRules per={general.per} berlinShift={berlinShift} />
        </>
      )}

      {analysed.length > 0 && screen === "all" && (
        <>
          <KpiStrip kpis={kpis} />
          <div className="term-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 8 }}>
            <Panel title="PAIRES · CLASSÉES PAR P&L/MOIS" right="CLIC = FICHE">
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 640 }}>
                  <Row head cols={PAIR_COLS}>
                    <span>PAIRE</span>
                    <span style={R}>P&L/M</span>
                    <span style={R}>TR/M</span>
                    <span style={R}>WIN</span>
                    <span>DD / LIM {account.ddLimit ?? "—"}</span>
                    <span style={R}>STOP</span>
                    <span style={R}>TP1</span>
                    <span style={R}>TP2</span>
                    <span>BLACKOUT CT</span>
                  </Row>
                  {[...general.per]
                    .sort((a, b) => b.c.pnl / spanMonths(b.e.result!) - a.c.pnl / spanMonths(a.e.result!))
                    .map(({ e, c }) => {
                      const n = spanMonths(e.result!);
                      const dd = c.propDD ?? c.maxDD;
                      const hours = e.result!.rules?.excludeHours ?? [];
                      return (
                        <Row key={e.symbol} cols={PAIR_COLS} onClick={() => setView(e.symbol)}>
                          <span style={{ color: "#FFF", fontWeight: 700 }}>{e.symbol}</span>
                          <span style={{ ...R, color: tone(c.pnl) }}>{short(c.pnl / n)}</span>
                          <span style={R}>{(c.n / n).toFixed(1)}</span>
                          <span style={R}>{Math.round(c.winRate * 100)}%</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: LOSS, width: 42 }}>{short(-dd)}</span>
                            <span style={{ flex: 1, height: 6, background: "#1A1A1A" }}>
                              <span style={bar(account.ddLimit ? (dd / account.ddLimit) * 100 : 0, account.ddLimit && dd / account.ddLimit > 0.45 ? LOSS : "#7A3A3A", 6)} />
                            </span>
                          </span>
                          <span style={{ ...R, color: DIM }}>{c.cfg.sl}TK</span>
                          <span style={{ ...R, color: DIM }}>{c.cfg.tp1}TK</span>
                          <span style={{ ...R, color: DIM }}>{kindOf(c.cfg) === "tp1trail" && c.cfg.tp2 > c.cfg.tp1 ? `${c.cfg.tp2}TK` : "—"}</span>
                          <span style={{ color: DIM }}>{hours.length ? hoursText(hours).toUpperCase() : "—"}</span>
                        </Row>
                      );
                    })}
                </div>
              </div>
            </Panel>

            <Panel title="P&L COMBINÉ · PAR COMPTE" right={`${general.months.length} MOIS · FRAIS DÉDUITS`}>
              {(() => {
                const cols = `64px 36px 44px 1fr 64px${copies > 1 ? " 72px" : ""}${account.split ? " 72px" : ""}`;
                const max = Math.max(1, ...general.months.map((m) => Math.abs(general.cell(m, null).pnl)));
                const tot = general.cell(null, null);
                return (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 380 }}>
                      <Row head cols={cols}>
                        <span>MOIS</span>
                        <span style={R}>TR</span>
                        <span style={R}>WIN</span>
                        <span />
                        <span style={R}>P&L</span>
                        {copies > 1 && <span style={R}>×{copies}</span>}
                        {account.split && <span style={R}>POUR TOI</span>}
                      </Row>
                      {general.months.map((m) => {
                        const c = general.cell(m, null);
                        const cut = shares.byMonth.get(m) ?? 0;
                        return (
                          <Row key={m} cols={cols}>
                            <span style={{ color: DIM }}>{termMonth(m)}</span>
                            <span style={R}>{c.n}</span>
                            <span style={{ ...R, color: DIM }}>{c.n ? `${Math.round((c.wins / c.n) * 100)}%` : "—"}</span>
                            <span style={bar((Math.abs(c.pnl) / max) * 100, tone(c.pnl))} />
                            <span style={{ ...R, color: tone(c.pnl), fontWeight: 600 }}>{short(c.pnl)}</span>
                            {copies > 1 && <span style={{ ...R, color: tone(c.pnl) }}>{short(c.pnl * copies)}</span>}
                            {account.split && <span style={{ ...R, color: tone(c.pnl - cut) }}>{short((c.pnl - cut) * copies)}</span>}
                          </Row>
                        );
                      })}
                      <Row cols={cols} style={{ borderTop: "1px solid #2E2E2E", padding: "6px 10px" }}>
                        <span style={{ color: ORANGE, fontWeight: 700, gridColumn: "span 4" }}>
                          TOTAL · {tot.n} TR · {tot.n ? Math.round((tot.wins / tot.n) * 100) : 0}%
                        </span>
                        <span style={{ ...R, color: tone(tot.pnl), fontWeight: 700 }}>{short(tot.pnl)}</span>
                        {copies > 1 && <span style={{ ...R, color: tone(tot.pnl), fontWeight: 700 }}>{short(tot.pnl * copies)}</span>}
                        {account.split && <span style={{ ...R, color: tone(tot.pnl - shares.total), fontWeight: 700 }}>{short((tot.pnl - shares.total) * copies)}</span>}
                      </Row>
                    </div>
                  </div>
                );
              })()}
            </Panel>
          </div>

          <Panel title="MATRICE P&L · PAIRE × MOIS" right="SURVOL = TRADES / WIN%">
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 1100 }}>
                <Row head cols={`44px repeat(${months.length}, minmax(0, 1fr)) 72px`}>
                  <span>PAIRE</span>
                  {months.map((m) => (
                    <span key={m} style={R}>
                      {termMonth(m).replace(" ", "")}
                    </span>
                  ))}
                  <span style={{ ...R, color: ORANGE }}>TOTAL</span>
                </Row>
                {[...general.per]
                  .sort((a, b) => b.c.pnl - a.c.pnl)
                  .map(({ e }) => {
                    const tot = general.cell(null, e.symbol);
                    return (
                      <Row key={e.symbol} cols={`44px repeat(${months.length}, minmax(0, 1fr)) 72px`}>
                        <span style={{ color: "#FFF", fontWeight: 700 }}>{e.symbol}</span>
                        {months.map((m) => {
                          const c = general.cell(m, e.symbol);
                          return c.n ? (
                            <span
                              key={m}
                              title={`${e.symbol} ${termMonth(m)} : ${c.n} trades · ${Math.round((c.wins / c.n) * 100)}%`}
                              style={{
                                ...R,
                                color: tone(c.pnl),
                                ...(Math.abs(c.pnl) >= 900 ? { background: c.pnl >= 0 ? "rgba(63,212,122,0.16)" : "rgba(255,77,77,0.18)", fontWeight: 700 } : {}),
                              }}
                            >
                              {short(c.pnl)}
                            </span>
                          ) : (
                            <span key={m} title={`${e.symbol} ${termMonth(m)} : aucun trade`} style={{ ...R, color: "#444" }}>
                              ·
                            </span>
                          );
                        })}
                        <span style={{ ...R, color: tone(tot.pnl), fontWeight: 700 }}>{short(tot.pnl)}</span>
                      </Row>
                    );
                  })}
              </div>
            </div>
          </Panel>

          <QuickWins entries={analysed} account={account} onDisable={(sym, z) => switchZone(sym, z, true)} onChoose={(sym, key) => choisir(sym, key)} />
        </>
      )}

      {analysed.length > 0 && sel && selCfg && screen === sel.symbol && (
        <SymbolReport
          key={sel.symbol}
          entry={sel}
          cfg={selCfg}
          allTrades={retainedAll(sel)?.trades ?? []}
          account={account}
          news={news}
          now={now}
          berlinShift={berlinShift}
          onChoose={(k) => choisir(sel.symbol, k)}
          onToggleZone={(z, off) => switchZone(sel.symbol, z, off)}
        />
      )}
        </>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "4px 12px", border: "1px solid #2E2E2E", color: DIM, fontSize: 11 }}>
        <span>
          <span style={{ color: GAIN }}>●</span> DATABENTO
        </span>
        {analysed[0] && (
          <span>
            {fmtDay(Math.min(...analysed.map((e) => e.result!.from)))} → {fmtDay(Math.max(...analysed.map((e) => e.result!.to)))}
          </span>
        )}
        <span>{analysed[0]?.result!.settings.lots ?? 2} LOTS · REMPLI SI DÉPASSÉ DE 1 TICK</span>
        <span style={{ marginLeft: "auto" }}>F1–F{keys.length} = ÉCRANS</span>
      </div>
    </div>
  );
}

/* ---- The terminal's pieces ------------------------------------------------------ */

const ORANGE = accentColor;
const GAIN = winColor;
const LOSS = lossColor;
const DIM = "#8A8A8A";
const TXT = "#FFF";
/** The two ways into a level: buying a fall onto it, selling a rise onto it. */
const buyColor = "#4FC3F7";
const sellColor = "#E879F9";
const R: React.CSSProperties = { textAlign: "right" };
const BUY_C = "#4FC3F7";
const PAIR_COLS = "44px 70px 44px 50px 1fr 64px 56px 64px 1fr";

/** A month the terminal way: "NOV 25". */
const termMonth = (key: string) =>
  `${["JAN", "FÉV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC"][Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

/** A bar inside a cell, as wide as its share. */
const bar = (pct: number, color: string, height = 8): React.CSSProperties => ({
  display: "block",
  height,
  width: `${Math.max(1, Math.min(100, pct)).toFixed(1)}%`,
  background: color,
});

/** A panel: its title on a grey band in orange, what it says about itself on the right. */
function Panel({ title, right, children, style, id }: { title: string; right?: string; children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section id={id} style={{ border: "1px solid #2E2E2E", background: "#000", minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 10px", background: "#1A1A1A", color: ORANGE, fontWeight: 700, fontSize: 11, letterSpacing: "0.04em" }}>
        <span>{title}</span>
        {right && <span style={{ color: DIM, fontWeight: 500 }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** One line of a table: a grid of cells, a header in grey, a button when it opens something. */
function Row({ cols, head, onClick, children, style }: { cols: string; head?: boolean; onClick?: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  const s: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: cols,
    gap: 8,
    alignItems: "center",
    padding: head ? "5px 10px" : "3px 10px",
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${head ? "#2E2E2E" : "#141414"}`,
    ...(head ? { color: DIM, fontSize: 10.5 } : {}),
    ...style,
  };
  return onClick ? (
    <button type="button" onClick={onClick} className="term-row" style={{ background: "transparent", color: "inherit", ...s, cursor: "pointer", width: "100%", textAlign: "left", border: 0, borderBottom: s.borderBottom, font: "inherit" }}>
      {children}
    </button>
  ) : (
    <div style={s}>{children}</div>
  );
}

/** The figures a screen opens on, in a row of cells. */
function KpiStrip({ kpis }: { kpis: { label: string; value: string; color: string; sub: string }[] }) {
  return (
    <div style={{ border: "1px solid #2E2E2E", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {kpis.map((k) => (
        <div key={k.label} style={{ padding: "8px 12px", borderRight: "1px solid #2E2E2E" }}>
          <div style={{ color: ORANGE, fontSize: 10.5, fontWeight: 700 }}>{k.label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: k.color, lineHeight: 1.25 }}>{k.value}</div>
          <div style={{ color: DIM, fontSize: 10.5 }}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

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

/** One rule: what to do, in a few words, and the detail under it. */
type Rule = { k: string; main: React.ReactNode; detail?: React.ReactNode };

/** A group of rules on its own panel: the moment of the day they belong to. */
function RuleCard({ num, title, rules, detail }: { num: number; title: string; rules: (Rule | null | false | undefined)[]; detail: boolean }) {
  return (
    <Panel title={`${num} · ${title.toUpperCase()}`}>
      {rules
        .filter((x): x is Rule => !!x)
        .map((x) => (
          <div key={x.k} style={{ padding: "7px 10px", borderBottom: "1px solid #141414" }}>
            <div style={{ color: ORANGE, fontSize: 10.5, fontWeight: 700 }}>{x.k.toUpperCase()}</div>
            <div style={{ color: TXT, marginTop: 2, lineHeight: 1.45 }}>{x.main}</div>
            {detail && x.detail && <div style={{ color: DIM, fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>{x.detail}</div>}
          </div>
        ))}
    </Panel>
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
      <RuleCard
        num={1}
        title="Préparer la séance"
        detail={detail}
        rules={[
          h && { k: "Horaires", main: `Ordres de ${h[0]}h à ${h[1]}h Chicago`, detail: "Sauf les heures exclues de la paire. Elles ne concernent que les nouveaux ordres : un ordre non rempli à l'heure exclue s'annule, un trade déjà rempli se gère jusqu'au bout (SL, TP1, trailing, 4 h max)." },
          {
            k: "News",
            main: bo ? `Pas d'ordre ${bo.before} min avant → ${bo.after} min après` : "Pas de blackout",
            detail: bo
              ? bo.all
                ? "Chaque news 3 étoiles des devises de la paire, selon la note de TradingView : ce sont celles du Trading Plan. Pas toutes les 3 étoiles d'investing.com — Initial Jobless Claims, ADP, JOLTS ou les stocks de pétrole n'en font pas partie (les bloquer aussi coûte ≈ 120 $/mois au backtest)."
                : "CPI, NFP, Fed et la banque centrale de la paire"
              : undefined,
          },
          r.rules?.minApproach
            ? {
                k: "Approche",
                main: `Séance ouverte à au moins ${fmtDistBySymbol(r.rules.minApproach, symbols)} du niveau — sinon pas de trade sur ce niveau de la séance, même après un rebond de 30 ticks`,
                detail: `La séance doit ouvrir (17h, 19h pour les grains) à au moins ${fmtDistBySymbol(r.rules.minApproach, symbols)} du niveau — le niveau lui-même, pas le prix de l'ordre (ZS : ordre 7 ticks au-delà) —, sinon pas d'ordre sur ce niveau de toute la séance — même si le prix s'en éloigne ensuite de 30 ticks ou plus puis revient (ZS le 11.11 : ouvert à 9 ticks, parti de 44 ticks, revenu : pas de trade). Il redevient tradable à la séance suivante, si elle ouvre à au moins ${fmtDistBySymbol(r.rules.minApproach, symbols)} du niveau. Un niveau traversé dans la séance ne se trade plus dans l'autre sens.`,
              }
            : null,
          {
            k: "Niveau tradable",
            main: `Deux conditions ensemble : ouverture à au moins ${fmtDistBySymbol(r.rules?.minApproach ?? 15, symbols)} du niveau, et niveau pas encore utilisé`,
            detail: `Utilisé = déjà touché (par un trade ou hors horaires) sans s'en être éloigné de ${fmtDistBySymbol(r.settings.rearm, symbols)} depuis. Exemples — ouvert à 40 tk, vient sur le niveau à 9h : oui. Ouvert à 9 tk, part de 44 tk puis revient : non (approche). Ouvert à 40 tk, touché la nuit, repart de 15 tk, revient à 9h : non (même touche). Pareil mais repart de 35 tk : oui (nouvelle touche).`,
          },
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
            detail:
              "Rempli dès que le prix touche le niveau, quelle que soit ta place dans la file (écart propre à la paire s'il est indiqué). Le prix exact est dans la colonne « Entrée » des prix par niveau. Posé sur le niveau même, l'ordre peut être touché sans être pris.",
          },
          {
            k: "Ordre pas rempli",
            main: "Le prix touche ton entrée sans te prendre puis repart : laisse l'ordre posé",
            detail: `Tant que le prix ne s'est pas éloigné de ${fmtDistBySymbol(r.settings.rearm, symbols)}, c'est la même touche et l'ordre reste valable. S'il est rempli au retour pendant tes horaires, c'est le trade. Exemple 6B le 14.09 : touché vers 4h15, remonté de 21 ticks, revenu et rempli à 7h53, avant 8h : TP1 à 10h54.`,
          },
          {
            k: "Un trade par paire",
            main: `${perDay} trade par jour et par paire`,
            detail: "Un ordre par niveau valable : dès que l'un est rempli, annule les autres de cette paire pour la journée. Les autres paires gardent les leurs.",
          },
          {
            k: "Nouvelle touche",
            main: `Le prix doit s'éloigner de ${fmtDistBySymbol(r.settings.rearm, symbols)} puis revenir`,
            detail: `Avant qu'un niveau déjà touché compte de nouveau. Moins loin, même pendant des heures, c'est toujours la même touche. Le prix à atteindre est dans la colonne « 2e rebond » des prix par niveau. Exemple 6E le 06.11.26, niveau 1,1187 : séance ouverte 100 ticks au-dessus, touché à 1h32 (avant 2h, hors horaires), remonté de 43 ticks à 2h37, revenu à 3h19 → achat rempli à 3h34, +8,5 ticks. À l'inverse, 6J le 02.11.26 : touché à 20h, reparti de 23 ticks seulement, revenu le matin → pas de trade.`,
          },
          {
            k: "Déjà touché hors horaires",
            main: "Pas d'ordre sur un niveau déjà touché la nuit, à une heure exclue ou pendant une news",
            detail: `Une touche la nuit compte : le niveau est utilisé, même sans trade. Exemple : touché à 23h30, le prix s'en éloigne de 15 ticks puis revient à 3h — pas de trade, c'est la même touche. Il le redevient seulement après un éloignement de ${fmtDistBySymbol(r.settings.rearm, symbols)} puis un retour pendant tes horaires. Backtest : ces trades gagnent 1 fois sur 3 et perdent ≈ 13 500 $ par an.`,
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
function PairRules({ per, berlinShift }: { per: { e: Entry; c: ConfigStats }[]; berlinShift: number }) {
  const cols = "44px minmax(0, 3fr) 120px 140px 1.3fr 80px";
  return (
    <Panel title="RÈGLES PAR PAIRE">
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 760 }}>
          <Row head cols={cols}>
            <span>PAIRE</span>
            <span>NIVEAUX</span>
            <span>STOP</span>
            <span>TP1 = TRAILING · TP2</span>
            <span>HORAIRES CT · BERLIN</span>
            <span>NEWS</span>
          </Row>
          {per.map(({ e, c }) => {
            const r = e.result!;
            const hours = r.rules?.excludeHours ?? [];
            const levels = Object.entries(c.zones).sort(([a], [b]) => Number(a) - Number(b));
            return (
              <Row key={e.symbol} cols={cols} style={{ padding: "6px 10px" }}>
                <span style={{ color: TXT, fontWeight: 700 }}>{e.symbol}</span>
                <span>
                  {levels.map(([z, b], i) => (
                    <span key={z} style={{ color: b.pnl > 0 ? TXT : LOSS }}>
                      {i ? " · " : ""}
                      {fmtZone(Number(z), e.symbol)}
                      {b.pnl > 0 ? "" : "✗"}
                    </span>
                  ))}
                </span>
                <span style={{ color: LOSS }}>
                  {c.cfg.sl} TK <span style={{ color: DIM }}>· {(c.cfg.sl * r.tickValue * r.settings.lots).toFixed(0)} $</span>
                </span>
                <span style={{ color: GAIN }}>
                  +{c.cfg.tp1} TK{kindOf(c.cfg) === "tp1trail" && c.cfg.tp2 > c.cfg.tp1 ? ` · +${c.cfg.tp2} TK` : ""}
                </span>
                <span>
                  <span style={{ color: ORANGE }}>{spansText(orderSpans(r.rules?.hours ?? [2, 14], hours))}</span>
                  <span style={{ color: DIM }}> · {spansText(orderSpans(r.rules?.hours ?? [2, 14], hours), berlinShift)}</span>
                </span>
                <span style={{ color: TXT }}>{newsCurrencies(e.symbol).join(" + ")}</span>
              </Row>
            );
          })}
        </div>
      </div>
    </Panel>
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
  return spans.map(([a, b]) => `${a}h–${b}h`).join(" · ");
}

/** A time on Chicago's clock, the terminal way: "04.11 09:16". */
const ctParts = new Intl.DateTimeFormat("fr-CH", { timeZone: "America/Chicago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const ctTime = (t: number) => {
  const p = Object.fromEntries(ctParts.formatToParts(t).map((x) => [x.type, x.value]));
  return { date: `${p.day}.${p.month}`, time: `${p.hour}:${p.minute}` };
};

/** How a trade ended, for the runner-trailed exit the plan uses. */
const OUT_TEXT: Record<string, string> = {
  SL: "STOP",
  TP1: "TP1 · RUNNER À L'ENTRÉE",
  TR: "TP1 + TRAILING",
  TP2: "TP1 + TP2",
  TO: "CLÔTURÉ (DURÉE MAX)",
};

function SymbolReport({
  entry,
  cfg,
  allTrades,
  account,
  news,
  now,
  berlinShift,
  onChoose,
  onToggleZone,
}: {
  entry: Entry;
  cfg: ConfigStats;
  /** The chosen configuration's trades, the levels switched off included: the levels panel shows those too. */
  allTrades: number[][];
  account: AccountRules;
  news: News[] | null;
  now: number;
  berlinShift: number;
  onChoose: (key: string) => void;
  onToggleZone: (zone: number, off: boolean) => void;
}) {
  const r = entry.result!;
  const c = cfg.cfg;
  const lots = r.settings.lots;
  const nMonths = spanMonths(r);
  const months = monthsBetween(r.from, r.to);
  const traded = months.filter((m) => cfg.months[m]);
  const [month, setMonth] = useState<string | null>(traded[traded.length - 1] ?? null);
  /** A level picked in the levels panel: the trades panel then shows that level's trades, every month. */
  const [level, setLevel] = useState<number | null>(null);
  const tick = r.tickSize ?? CONTRACTS[r.symbol]?.tickSize;
  const price = (p: number) => (tick ? fmtPrice(p, r.symbol, tick) : String(p));
  const money = r.tickValue * lots;
  const levels = Object.entries(cfg.zones).sort(([a], [b]) => Number(a) - Number(b));
  const hours = r.rules?.excludeHours ?? [];
  const hasTp2 = kindOf(c) === "tp1trail" && c.tp2 > c.tp1;
  const dd = cfg.propDD ?? cfg.maxDD;
  const entryText = c.offset === 0 ? "SUR LE NIVEAU" : `${Math.abs(c.offset)} TICK${Math.abs(c.offset) > 1 ? "S" : ""} ${c.offset > 0 ? "AVANT LE" : "AU-DELÀ DU"} NIVEAU`;
  const rows = level !== null ? allTrades.filter((t) => t[6] === level) : month ? cfg.trades.filter((t) => monthOf(t[0] * 60000) === month) : [];
  const lb = level !== null ? { n: rows.length, wins: rows.filter((t) => t[1] > 0).length, pnl: rows.reduce((a, t) => a + t[1] * money, 0) } : null;
  const mb = lb ?? (month ? cfg.months[month] : null);
  const ms = Object.values(cfg.months);
  const far = hasTp2 ? c.tp2 : c.tp1;
  const range = c.sl + far;
  const monthMax = Math.max(1, ...months.map((m) => Math.abs(cfg.months[m]?.pnl ?? 0)));
  const priceCols = hasTp2 ? 5 : 4;
  const priceGrid = `72px repeat(${priceCols}, minmax(0, 1fr)) 12px repeat(${priceCols}, minmax(0, 1fr))`;
  // Fixed widths: each row is a grid of its own, and a column sized by its content would move the P&L on the rows with a long exit.
  const tradeCols = "92px 46px 22px 70px 70px 70px 70px minmax(150px, 1fr) 44px 64px";
  const cfgCols = "40px 34px 1.6fr 44px 64px 50px 48px 44px 48px";
  const kpis = [
    { label: `P&L/MOIS · ${r.symbol}`, value: short(cfg.pnl / nMonths), color: tone(cfg.pnl), sub: `${short(cfg.pnl)} SUR LA PÉRIODE` },
    { label: "TRADES/MOIS", value: (cfg.n / nMonths).toFixed(1).replace(".", ","), color: TXT, sub: entryText },
    { label: "WIN%", value: (cfg.winRate * 100).toFixed(1).replace(".", ","), color: TXT, sub: `${ms.filter((m) => m.pnl > 0).length}/${ms.length} MOIS POSITIFS` },
    { label: "MAX DD", value: short(-dd), color: LOSS, sub: account.ddLimit ? `${Math.round((dd / account.ddLimit) * 100)}% DE LA LIMITE` : "FIN DE JOURNÉE" },
    { label: "STOP", value: `${c.sl} TK`, color: LOSS, sub: `${(c.sl * r.tickValue * lots).toFixed(0)} $ À ${lots} LOTS` },
    { label: hasTp2 ? "TP1 → TP2" : "TP1", value: hasTp2 ? `${c.tp1}→${c.tp2}` : `${c.tp1}`, color: GAIN, sub: kindOf(c) === "tp1trail" ? `TRAILING ${c.dist} TK` : exitShort(c).toUpperCase() },
  ];

  return (
    <>
      <KpiStrip kpis={kpis} />
      <div className="term-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 1.5fr)", gap: 8 }}>
        <Panel title={`RÈGLE ${r.symbol}`} right={`${fmtDay(r.from)} → ${fmtDay(r.to)}`}>
          <div style={{ padding: "8px 10px", lineHeight: 1.9 }}>
            <div>
              <span style={{ color: DIM }}>NIVEAUX </span>
              {levels.map(([z, b]) => (
                <span key={z} title={`${fmtUsd(b.pnl)} sur ${b.n} trades`} style={{ color: b.pnl > 0 ? TXT : LOSS, marginRight: 10 }}>
                  {fmtZone(Number(z), r.symbol)}
                  {b.pnl > 0 ? "" : "✗"}
                </span>
              ))}
            </div>
            <div>
              <span style={{ color: DIM }}>ENTRÉE </span>
              <span style={{ color: TXT }}>LIMITE {entryText}</span>
            </div>
            <div>
              <span style={{ color: DIM }}>LOTS </span>
              <span style={{ color: TXT }}>50K : {lots} LOTS</span>
              {kindOf(c) === "tp1trail" && lots >= 2 && <span style={{ color: DIM }}> · {lots / 2} À TP1, L&apos;AUTRE EN TRAILING</span>}
            </div>
            <div>
              <span style={{ color: DIM }}>STOP </span>
              <span style={{ color: LOSS }}>
                {c.sl} TK · {(c.sl * r.tickValue * lots).toFixed(0)} $ À {lots} LOTS
              </span>
            </div>
            <div>
              <span style={{ color: DIM }}>TP1 </span>
              <span style={{ color: GAIN }}>+{c.tp1} TK</span>
              <span style={{ color: DIM }}> · 1 LOT · STOP → ENTRÉE</span>
            </div>
            {hasTp2 && (
              <div>
                <span style={{ color: DIM }}>TP2 </span>
                <span style={{ color: GAIN }}>+{c.tp2} TK</span>
                <span style={{ color: DIM }}> · RUNNER EN TRAILING {c.dist} TK</span>
              </div>
            )}
            <div>
              <span style={{ color: DIM }}>HORAIRES </span>
              <span style={{ color: ORANGE }}>{spansText(orderSpans(r.rules?.hours ?? [2, 14], hours))} CT</span>
              <span style={{ color: DIM }}> · </span>
              <span style={{ color: TXT }}>{spansText(orderSpans(r.rules?.hours ?? [2, 14], hours), berlinShift)} BERLIN</span>
            </div>
            {HOURS_WHY[r.symbol] && <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.5 }}>{HOURS_WHY[r.symbol].toUpperCase()}</div>}
            <div>
              <span style={{ color: DIM }}>BLACKOUT </span>
              <span style={{ color: TXT }}>{hours.length ? `${hoursText(hours).toUpperCase()} CT` : "AUCUN"}</span>
            </div>
            {hours.length > 0 && (
              <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}>
                PAS DE NOUVEL ORDRE PENDANT CES HEURES : UN ORDRE NON REMPLI QUAND ELLES COMMENCENT S&apos;ANNULE. UN TRADE REMPLI AVANT SE GÈRE
                JUSQU&apos;AU BOUT (SL, TP1, TRAILING, 4 H MAX){r.symbol === "6B" ? " — EX. ENTRÉ À 7H40 : FERMÉ AU PLUS TARD À 11H40." : "."}
              </div>
            )}
          </div>
          <div style={{ padding: "2px 10px 10px" }}>
            <div style={{ color: DIM, fontSize: 10.5, marginBottom: 4 }}>RISQUE / GAIN EN TICKS</div>
            <div style={{ display: "flex", height: 10 }}>
              <span style={{ display: "block", width: `${((c.sl / range) * 100).toFixed(1)}%`, background: LOSS }} />
              <span style={{ width: 2, background: "#FFF" }} />
              <span style={{ display: "block", width: `${((c.tp1 / range) * 100).toFixed(1)}%`, background: GAIN }} />
              {hasTp2 && <span style={{ width: 1, background: "#000" }} />}
              {hasTp2 && <span style={{ display: "block", flex: 1, background: "rgba(63,212,122,0.4)" }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginTop: 3 }}>
              <span style={{ color: LOSS }}>−{c.sl}</span>
              <span>ENTRÉE</span>
              <span style={{ color: GAIN }}>
                TP1 +{c.tp1}
                {hasTp2 ? ` · TP2 +${c.tp2}` : ""}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="MOIS" right="CLIC = TRADES">
          <Row head cols="62px 28px 40px 1fr 54px">
            <span>MOIS</span>
            <span style={R}>TR</span>
            <span style={R}>WIN</span>
            <span />
            <span style={R}>P&L</span>
          </Row>
          {[...months].reverse().map((m) => {
            const b = cfg.months[m];
            const on = m === month && level === null;
            return (
              <Row
                key={m}
                cols="62px 28px 40px 1fr 54px"
                onClick={
                  b
                    ? () => {
                        setMonth(m);
                        setLevel(null);
                      }
                    : undefined
                }
                style={on ? { background: ORANGE, color: "#000" } : undefined}
              >
                <span style={{ color: on ? "#000" : DIM }}>{termMonth(m)}</span>
                <span style={R}>{b ? b.n : "–"}</span>
                <span style={{ ...R, color: on ? "#000" : DIM }}>{b ? `${Math.round((b.wins / b.n) * 100)}%` : ""}</span>
                <span style={b ? bar((Math.abs(b.pnl) / monthMax) * 100, tone(b.pnl)) : { display: "block" }} />
                <span style={{ ...R, color: on ? "#000" : b ? tone(b.pnl) : "#444", fontWeight: 600 }}>{b ? short(b.pnl) : "–"}</span>
              </Row>
            );
          })}
        </Panel>

        <Panel title={`TRADES · ${level !== null ? `NIVEAU ${price(level)} · TOUTE LA PÉRIODE` : month ? termMonth(month) : "—"}`} right={mb ? `${mb.n} TR · ${Math.round((mb.wins / mb.n) * 100)}% · ${short(mb.pnl)} $` : "AUCUN TRADE"} style={{ gridColumn: "span 1", scrollMarginTop: 16 }} id="db-trades">
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 760 }}>
              <Row head cols={tradeCols}>
                <span>OUVERT</span>
                <span>FERMÉ</span>
                <span>S</span>
                <span style={R}>NIVEAU</span>
                <span style={R}>ENTRÉE</span>
                <span style={R}>SL</span>
                <span style={R}>TP1</span>
                <span>SORTIE</span>
                <span style={R}>TK</span>
                <span style={R}>P&L</span>
              </Row>
              {rows.map((t) => {
                const [m, ticks, end, , , , zone, dir, out] = t;
                const known = zone !== undefined && dir !== undefined && tick;
                const e = known ? zone + dir * c.offset * tick : null;
                const outcome = out === undefined ? null : OUTCOMES[out];
                const runner = outcome === "TR" && lots === 2 ? Math.round(ticks * 2 - c.tp1) : null;
                const color = tone(ticks);
                const o = ctTime(m * 60000);
                return (
                  <Row key={m} cols={tradeCols}>
                    <span style={{ color: DIM }}>
                      {o.date} {o.time}
                    </span>
                    <span style={{ color: DIM }}>{end === undefined ? "—" : ctTime(end * 60000).time}</span>
                    <span style={{ color: dir === 1 ? buyColor : sellColor, fontWeight: 700 }}>{dir === undefined ? "—" : dir === 1 ? "B" : "S"}</span>
                    <span style={R}>{zone === undefined ? "—" : price(zone)}</span>
                    <span style={{ ...R, color: TXT }}>{e === null ? "—" : price(e)}</span>
                    <span style={{ ...R, color: LOSS }}>{e === null ? "—" : price(e - dir! * c.sl * tick!)}</span>
                    <span style={{ ...R, color: GAIN }}>{e === null ? "—" : price(e + dir! * c.tp1 * tick!)}</span>
                    <span style={{ color: "#CCC", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {outcome === null ? "—" : runner !== null ? `TP1 + TRAIL ${runner >= 0 ? "+" : "−"}${Math.abs(runner)}` : OUT_TEXT[outcome] ?? outcome}
                    </span>
                    <span style={{ ...R, color }}>
                      {ticks > 0 ? "+" : ticks < 0 ? "−" : ""}
                      {String(Math.round(Math.abs(ticks) * 100) / 100).replace(".", ",")}
                    </span>
                    <span style={{ ...R, color, fontWeight: 700 }}>{short(ticks * money)}</span>
                  </Row>
                );
              })}
              {!rows.length && <div style={{ color: DIM, padding: "12px 10px" }}>{level !== null ? "AUCUN TRADE SUR CE NIVEAU" : "AUCUN TRADE CE MOIS"}</div>}
            </div>
          </div>
          <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A" }}>
            HEURES CT · TK = TICKS/CONTRAT (MOY. {lots} LOTS) · P&L À {lots} LOTS, AVANT FRAIS
          </div>
        </Panel>
      </div>

      <LevelsPanel
        zones={entry.zones}
        trades={allTrades}
        disabled={entry.disabled}
        onToggle={onToggleZone}
        money={money}
        from={r.from}
        to={r.to}
        price={price}
        selected={level}
        onPick={(z) => {
          setLevel(z === level ? null : z);
          document.getElementById("db-trades")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <NewsPanel symbol={r.symbol} news={news} now={now} before={r.rules?.blackout?.before ?? 10} after={r.rules?.blackout?.after ?? 10} />

      <div className="term-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 8 }}>
        {tick && (
          <Panel title="PRIX PAR NIVEAU" right="REB = 2E REBOND (S'ÉLOIGNER JUSQU'À)">
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: hasTp2 ? 760 : 640 }}>
                <Row head cols={priceGrid}>
                  <span />
                  <span style={{ gridColumn: `span ${priceCols}`, color: buyColor, fontWeight: 700 }}>ACHAT · PRIX DESCEND</span>
                  <span />
                  <span style={{ gridColumn: `span ${priceCols}`, color: sellColor, fontWeight: 700 }}>VENTE · PRIX MONTE</span>
                </Row>
                <Row head cols={priceGrid}>
                  <span>NIVEAU</span>
                  {[0, 1].flatMap((side) => [
                    ...(side ? [<span key="gap" />] : []),
                    ...["ENTR", "SL", "TP1", ...(hasTp2 ? ["TP2"] : []), "REB"].map((h) => (
                      <span key={`${side}${h}`} style={R}>
                        {h}
                      </span>
                    )),
                  ])}
                </Row>
                {levels.map(([zs, b]) => {
                  const z = Number(zs);
                  const bad = b.pnl <= 0;
                  const side = (dir: 1 | -1) => {
                    const e = z + dir * c.offset * tick;
                    return [e, e - dir * c.sl * tick, e + dir * c.tp1 * tick, ...(hasTp2 ? [e + dir * c.tp2 * tick] : []), z + dir * r.settings.rearm * tick];
                  };
                  const colors = [TXT, LOSS, GAIN, ...(hasTp2 ? [GAIN] : []), DIM];
                  const cells = (dir: 1 | -1) =>
                    side(dir).map((p, k) => (
                      <span key={`${dir}${k}`} style={{ ...R, color: colors[k] }}>
                        {price(p)}
                      </span>
                    ));
                  return (
                    <Row key={zs} cols={priceGrid} style={bad ? { opacity: 0.45 } : undefined}>
                      <span style={{ color: TXT, fontWeight: 700 }}>
                        {fmtZone(z, r.symbol)}
                        {bad ? "✗" : ""}
                      </span>
                      {cells(1)}
                      <span />
                      {cells(-1)}
                    </Row>
                  );
                })}
              </div>
            </div>
          </Panel>
        )}

        <Panel title="CONFIGS TESTÉES" right={`ENTRÉE ${fmtOffset(c.offset)} · CLIC = RETENIR`}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 580 }}>
              <Row head cols={cfgCols}>
                <span>#</span>
                <span style={R}>SL</span>
                <span>SORTIE</span>
                <span style={R}>WIN</span>
                <span style={R}>P&L</span>
                <span style={R}>DD</span>
                <span style={R}>PF</span>
                <span style={R}>P/DD</span>
                <span style={R}>M+</span>
              </Row>
              {r.top.map((x, i) => {
                const xm = Object.values(x.months);
                const on = x.key === cfg.key;
                return (
                  <Row key={x.key} cols={cfgCols} onClick={() => onChoose(x.key)} style={on ? { background: "#1F1608", boxShadow: `inset 2px 0 0 ${ORANGE}` } : undefined}>
                    <span style={{ color: i === 0 ? ORANGE : DIM, fontWeight: 700 }}>{i === 0 ? "TOI" : `#${i + 1}`}</span>
                    <span style={R}>{x.cfg.sl}</span>
                    <span style={{ color: "#CCC" }}>{exitShort(x.cfg).toUpperCase()}</span>
                    <span style={R}>{Math.round(x.winRate * 100)}%</span>
                    <span style={{ ...R, color: tone(x.pnl) }}>{short(x.pnl)}</span>
                    <span style={{ ...R, color: LOSS }}>{short(-(x.propDD ?? x.maxDD))}</span>
                    <span style={R}>{fmtPfOrInf(x.pf)}</span>
                    <span style={R}>{ratioOf(x).toFixed(1)}</span>
                    <span style={R}>
                      {xm.filter((mm) => mm.pnl > 0).length}/{xm.length}
                    </span>
                  </Row>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

/** An hour on a given clock. */
const clock = (t: number, timeZone: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });
const dayIn = (t: number) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" }).toUpperCase();

/** The coming week's releases that block this pair's orders: its own currency's and the dollar's three-star ones. */
function NewsPanel({ symbol, news, now, before, after }: { symbol: string; news: News[] | null; now: number; before: number; after: number }) {
  const cur = newsCurrencies(symbol);
  const list = (news ?? []).filter((e) => cur.includes(e.currency));
  const cols = "92px 54px 54px 44px 1fr";
  return (
    <Panel title={`NEWS QUI BLOQUENT ${symbol} · 7 JOURS`} right={`${cur.join(" + ")} · 3 ÉTOILES TRADINGVIEW · −${before} → +${after} MIN`}>
      {news === null ? (
        <div style={{ color: DIM, padding: "10px" }}>CALENDRIER INDISPONIBLE POUR L&apos;INSTANT</div>
      ) : list.length === 0 ? (
        <div style={{ color: DIM, padding: "10px" }}>AUCUNE NEWS BLOQUANTE CES 7 PROCHAINS JOURS</div>
      ) : (
        <>
          <Row head cols={cols}>
            <span>JOUR</span>
            <span>BERLIN</span>
            <span>CT</span>
            <span>DEV.</span>
            <span>NEWS</span>
          </Row>
          {list.map((e) => (
            <Row key={`${e.at}${e.currency}${e.title}`} cols={cols} style={e.at < now ? { opacity: 0.45 } : undefined}>
              <span style={{ color: DIM }}>{dayIn(e.at)}</span>
              <span>{clock(e.at, "Europe/Berlin")}</span>
              <span style={{ color: ORANGE }}>{clock(e.at, "America/Chicago")}</span>
              <span style={{ color: e.currency === "USD" ? DIM : TXT, fontWeight: 700 }}>{e.currency}</span>
              <span style={{ color: TXT }}>{e.title}</span>
            </Row>
          ))}
        </>
      )}
    </Panel>
  );
}

/** Why each pair keeps the hours it keeps, in a line. */

/** The hours orders go in, as spans: 2h–14h less the hours kept out. */
function orderSpans(hours: [number, number], excluded: number[]): [number, number][] {
  const spans: [number, number][] = [];
  for (let h = hours[0]; h < hours[1]; h++) {
    if (excluded.includes(h)) continue;
    const last = spans[spans.length - 1];
    if (last && last[1] === h) last[1] = h + 1;
    else spans.push([h, h + 1]);
  }
  return spans;
}
const spansText = (spans: [number, number][], shift = 0) =>
  spans.map(([a, b]) => `${String((a + shift + 24) % 24).padStart(2, "0")}H–${String((b + shift + 24) % 24).padStart(2, "0")}H`).join(" · ");

/**
 * Each level of a pair side by side, to decide which to keep: its trades,
 * win rate, P&L and average, the two halves of the period apart (a level
 * that only earned in one of them is luck as much as a level), longs and
 * shorts, and a verdict read off those.
 */
function LevelsPanel({
  zones,
  trades,
  disabled,
  onToggle,
  money,
  from,
  to,
  price,
  selected,
  onPick,
}: {
  zones: number[];
  trades: number[][];
  disabled: number[];
  onToggle: (zone: number, off: boolean) => void;
  money: number;
  from: number;
  to: number;
  price: (p: number) => string;
  selected: number | null;
  onPick: (z: number) => void;
}) {
  const mid = (from + to) / 2;
  const stats = [...zones]
    .sort((a, b) => b - a)
    .map((z) => {
      const ts = trades.filter((t) => t[6] === z);
      const pnl = (list: number[][]) => list.reduce((a, t) => a + t[1] * money, 0);
      const first = ts.filter((t) => t[0] * 60000 < mid);
      const second = ts.filter((t) => t[0] * 60000 >= mid);
      const longs = ts.filter((t) => t[7] === 1);
      const shorts = ts.filter((t) => t[7] === -1);
      const total = pnl(ts);
      const p1 = pnl(first);
      const p2 = pnl(second);
      const verdict: [string, string] =
        ts.length < 6
          ? ["TROP PEU DE TRADES", DIM]
          : total <= 0 && p1 <= 0 && p2 <= 0
            ? ["À RETIRER", LOSS]
            : total <= 0 || p1 < 0 || p2 < 0
              ? ["À SURVEILLER", ORANGE]
              : ["GARDER", GAIN];
      return {
        z,
        n: ts.length,
        wins: ts.filter((t) => t[1] > 0).length,
        total,
        avg: ts.length ? total / ts.length : 0,
        p1,
        n1: first.length,
        p2,
        n2: second.length,
        longs: [longs.length, pnl(longs)] as const,
        shorts: [shorts.length, pnl(shorts)] as const,
        last: ts.length ? Math.max(...ts.map((t) => t[0])) : null,
        verdict,
      };
    });
  const maxAbs = Math.max(1, ...stats.map((x) => Math.abs(x.total)));
  const cols = "84px 30px 40px 1fr 62px 58px 74px 74px 70px 70px 64px 128px 92px";
  const half = (p: number, n: number) => (
    <span style={{ ...R, color: n ? tone(p) : "#444" }}>
      {n ? short(p) : "–"} <span style={{ color: DIM, fontSize: 10 }}>({n})</span>
    </span>
  );
  return (
    <Panel title="NIVEAUX · GARDER OU RETIRER" right="CLIC = TRADES DU NIVEAU">
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1060 }}>
          <Row head cols={cols}>
            <span>NIVEAU</span>
            <span style={R}>TR</span>
            <span style={R}>WIN</span>
            <span />
            <span style={R}>P&L</span>
            <span style={R}>MOY/TR</span>
            <span style={R}>1RE MOITIÉ</span>
            <span style={R}>2E MOITIÉ</span>
            <span style={R}>ACHATS</span>
            <span style={R}>VENTES</span>
            <span style={R}>DERNIER</span>
            <span>VERDICT</span>
            <span />
          </Row>
          {stats.map((x) => {
            const on = selected === x.z;
            const off = isOff(disabled, x.z);
            return (
              <Row
                key={x.z}
                cols={cols}
                onClick={() => onPick(x.z)}
                style={{ ...(on ? { background: "#1F1608", boxShadow: `inset 3px 0 0 ${ORANGE}` } : {}), ...(off ? { opacity: 0.45, textDecoration: "line-through" } : {}) }}
              >
                <span style={{ color: on ? ORANGE : TXT, fontWeight: 700 }}>{price(x.z)}</span>
                <span style={R}>{x.n}</span>
                <span style={{ ...R, color: DIM }}>{x.n ? `${Math.round((x.wins / x.n) * 100)}%` : "–"}</span>
                <span style={x.n ? bar((Math.abs(x.total) / maxAbs) * 100, tone(x.total)) : { display: "block" }} />
                <span style={{ ...R, color: x.n ? tone(x.total) : "#444", fontWeight: 700 }}>{x.n ? short(x.total) : "–"}</span>
                <span style={{ ...R, color: x.n ? tone(x.avg) : "#444" }}>{x.n ? short(x.avg) : "–"}</span>
                {half(x.p1, x.n1)}
                {half(x.p2, x.n2)}
                <span style={{ ...R, color: x.longs[0] ? tone(x.longs[1]) : "#444" }}>
                  {x.longs[0] ? `${x.longs[0]} · ${short(x.longs[1])}` : "–"}
                </span>
                <span style={{ ...R, color: x.shorts[0] ? tone(x.shorts[1]) : "#444" }}>
                  {x.shorts[0] ? `${x.shorts[0]} · ${short(x.shorts[1])}` : "–"}
                </span>
                <span style={{ ...R, color: DIM }}>{x.last !== null ? ctTime(x.last * 60000).date : "–"}</span>
                <span style={{ color: off ? DIM : x.verdict[1], fontWeight: 700, fontSize: 11 }}>{off ? "DÉSACTIVÉE" : x.verdict[0]}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onToggle(x.z, !off);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      ev.stopPropagation();
                      onToggle(x.z, !off);
                    }
                  }}
                  title={off ? "Remettre ce niveau dans le plan et les chiffres" : "Retirer ce niveau du Trading Plan, du journal et des chiffres"}
                  style={{
                    cursor: "pointer",
                    textAlign: "center",
                    textDecoration: "none",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 0",
                    border: `1px solid ${off ? GAIN : "#555"}`,
                    color: off ? GAIN : "#AAA",
                  }}
                >
                  {off ? "RÉACTIVER" : "DÉSACTIVER"}
                </span>
              </Row>
            );
          })}
        </div>
      </div>
      <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A", lineHeight: 1.6 }}>
        P&L À 2 LOTS, AVANT FRAIS · MOITIÉS = 1RE ET 2E MOITIÉ DE LA PÉRIODE (NB DE TRADES) · GARDER : GAGNE SUR L&apos;ENSEMBLE ET SUR CHAQUE MOITIÉ (UNE MOITIÉ SANS TRADE NE COMPTE PAS) · À SURVEILLER : PERD SUR
        UNE MOITIÉ OU À PEU PRÈS NUL · À RETIRER : PERD SUR L&apos;ENSEMBLE ET SUR LES DEUX MOITIÉS · MOINS DE 6 TRADES : TROP PEU POUR JUGER · DÉSACTIVER = RETIRÉ DU TRADING PLAN, DU FORMULAIRE DU JOURNAL ET DES CHIFFRES DE LA PAIRE ET DU COMPTE
      </div>
    </Panel>
  );
}

type Win = {
  kind: "NIVEAU" | "SENS" | "HEURE" | "CONFIG";
  symbol: string;
  text: string;
  dPnl: number;
  dDD: number;
  n: number;
  action?: { label: string; run: () => void };
};

const ctHourOf = (t: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(t));

/**
 * Small changes that would have helped the account, each priced on the same
 * year of trades: a level switched off, one side kept at a level, an hour kept
 * out, another configuration of those tested. Net of fees, per month, with the
 * pair's drawdown before and after. Taking trades out of the year is an
 * estimate: a trade removed can free the day for another the backtest did not
 * take, which this does not count.
 */
function QuickWins({
  entries,
  account,
  onDisable,
  onChoose,
}: {
  entries: Entry[];
  account: AccountRules;
  onDisable: (symbol: string, zone: number) => void;
  onChoose: (symbol: string, key: string) => void;
}) {
  const wins = useMemo(() => {
    const out: Win[] = [];
    for (const e of entries) {
      const r = e.result!;
      const c = retained(e);
      if (!c) continue;
      const money = r.tickValue * r.settings.lots;
      const fee = feeRoundTrip(account.fees, e.symbol) / r.tickValue;
      const mode = r.settings.ddMode ?? "intraday";
      const span = spanMonths(r);
      const net = (rows: number[][]) => rows.reduce((a, t) => a + (t[1] - fee) * money, 0) / span;
      const dd = (rows: number[][]) =>
        trailingDrawdown(
          rows.filter((t) => t[2] !== undefined).map((t) => ({ start: t[0] * 60000, end: t[2] * 60000, final: (t[1] - fee) * money, mfe: t[3] * money, mae: t[4] * money, give: t[5] * money })),
          null,
          mode
        ).dd;
      const base = c.trades;
      const baseNet = net(base);
      const baseDD = dd(base);
      const tryOut = (keep: (t: number[]) => boolean) => {
        const rows = base.filter(keep);
        return { dPnl: net(rows) - baseNet, dDD: dd(rows) - baseDD, n: base.length - rows.length };
      };
      // 1. A level off.
      const zones = [...new Set(base.map((t) => t[6]).filter((z) => z !== undefined))];
      for (const z of zones) {
        const x = tryOut((t) => t[6] !== z);
        out.push({ kind: "NIVEAU", symbol: e.symbol, text: `Désactiver le niveau ${fmtZone(z, e.symbol)}`, ...x, action: { label: "DÉSACTIVER", run: () => onDisable(e.symbol, z) } });
        // 2. One side only at that level.
        for (const dir of [1, -1]) {
          const x2 = tryOut((t) => !(t[6] === z && t[7] === dir));
          if (x2.n >= 3) out.push({ kind: "SENS", symbol: e.symbol, text: `${fmtZone(z, e.symbol)} : ne plus ${dir === 1 ? "acheter" : "vendre"} (garder les ${dir === 1 ? "ventes" : "achats"})`, ...x2 });
        }
      }
      // 3. An hour out (Chicago, the hour of the fill).
      const hours = [...new Set(base.map((t) => ctHourOf(t[0] * 60000)))];
      for (const h of hours) {
        const x = tryOut((t) => ctHourOf(t[0] * 60000) !== h);
        if (x.n >= 4) out.push({ kind: "HEURE", symbol: e.symbol, text: `Pas de nouvel ordre de ${h}h à ${h + 1}h CT`, ...x });
      }
      // 4. Another configuration of those tested, without the levels switched off.
      for (const alt of r.top) {
        if (alt.key === c.key) continue;
        const rows = alt.trades.filter((t) => !isOff(e.disabled, t[6]));
        out.push({
          kind: "CONFIG",
          symbol: e.symbol,
          text: `SL ${alt.cfg.sl} · TP1 ${alt.cfg.tp1}${alt.cfg.tp2 > alt.cfg.tp1 ? ` · TP2 ${alt.cfg.tp2}` : ""} au lieu de SL ${c.cfg.sl} · TP1 ${c.cfg.tp1}${c.cfg.tp2 > c.cfg.tp1 ? ` · TP2 ${c.cfg.tp2}` : ""}`,
          dPnl: net(rows) - baseNet,
          dDD: dd(rows) - baseDD,
          n: rows.length,
          action: { label: "RETENIR", run: () => onChoose(e.symbol, alt.key) },
        });
      }
    }
    // Worth showing: more money for no more drawdown, or a clearly smaller drawdown for little money.
    return out
      .filter((w) => (w.dPnl >= 5 && w.dDD <= 50) || (w.dDD <= -100 && w.dPnl >= -15))
      .sort((a, b) => b.dPnl - b.dDD / 12 - (a.dPnl - a.dDD / 12))
      .slice(0, 12);
  }, [entries, account, onDisable, onChoose]);

  const cols = "70px 40px minmax(0, 1fr) 84px 84px 124px 96px";
  const conf = (w: Win) => (w.kind === "CONFIG" ? null : w.n >= 10 ? ["SOLIDE", GAIN] : w.n >= 5 ? ["MOYENNE", ORANGE] : ["FAIBLE", LOSS]);
  return (
    <Panel title="RECO & QUICK WINS" right="NET DE FRAIS · SUR LA MÊME ANNÉE · À CONFIRMER">
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 860 }}>
          <Row head cols={cols}>
            <span>TYPE</span>
            <span>PAIRE</span>
            <span>CHANGEMENT</span>
            <span style={R}>P&L/MOIS</span>
            <span style={R}>DD PAIRE</span>
            <span style={R}>BASE</span>
            <span />
          </Row>
          {wins.length === 0 && <div style={{ color: DIM, padding: "12px 10px" }}>RIEN DE NET À GAGNER : AUCUN PETIT CHANGEMENT N&apos;AMÉLIORE LE COMPTE SANS COÛTER AILLEURS.</div>}
          {wins.map((w, i) => {
            const k = conf(w);
            return (
              <Row key={`${w.symbol}${w.text}${i}`} cols={cols}>
                <span style={{ fontSize: 10, fontWeight: 700, color: w.kind === "CONFIG" ? BUY_C : w.kind === "NIVEAU" ? ORANGE : DIM }}>{w.kind}</span>
                <span style={{ color: TXT, fontWeight: 700 }}>{w.symbol}</span>
                <span style={{ color: "#DDD", overflow: "hidden", textOverflow: "ellipsis" }} title={w.text}>
                  {w.text}
                </span>
                <span style={{ ...R, color: tone(w.dPnl), fontWeight: 700 }}>
                  {w.dPnl >= 0 ? "+" : "−"}
                  {Math.abs(Math.round(w.dPnl))} $
                </span>
                <span style={{ ...R, color: w.dDD <= 0 ? GAIN : LOSS }}>
                  {w.dDD <= 0 ? "−" : "+"}
                  {Math.abs(Math.round(w.dDD))} $
                </span>
                <span style={{ ...R, color: k ? (k[1] as string) : DIM, fontSize: 10.5 }} title={w.kind === "CONFIG" ? "Trades de cette config sur l'année" : "Trades retirés"}>
                  {w.kind === "CONFIG" ? `${w.n} TR` : `${w.n} TR · ${k![0]}`}
                </span>
                <span>
                  {w.action && (
                    <button
                      type="button"
                      onClick={w.action.run}
                      style={{ cursor: "pointer", width: "100%", fontFamily: "inherit", fontSize: 10, fontWeight: 700, padding: "2px 0", border: `1px solid ${ORANGE}`, background: "transparent", color: ORANGE }}
                    >
                      {w.action.label}
                    </button>
                  )}
                </span>
              </Row>
            );
          })}
        </div>
      </div>
      <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A", lineHeight: 1.6 }}>
        CHAQUE LIGNE = L&apos;EFFET SUR LA PAIRE, LE RESTE INCHANGÉ · P&L/MOIS NET DE FRAIS · DD PAIRE : − = MOINS DE DRAWDOWN · BASE = TRADES RETIRÉS (OU DE LA CONFIG) :
        MOINS DE 5, C&apos;EST FRAGILE · TOUT EST MESURÉ SUR L&apos;ANNÉE QUI A SERVI À FIXER LES RÈGLES : UN GAIN TROUVÉ ICI EST À CONFIRMER, PAS ACQUIS · SENS ET HEURE : À APPLIQUER TOI-MÊME,
        L&apos;APPLI NE LES GÈRE PAS ENCORE
      </div>
    </Panel>
  );
}

/**
 * The second strategy, "Trade with Trend", as the trader trades it: a zone
 * the trend broke, retested once and left, traded on the second return. Its
 * numbers are the backtest's (2026-11-17), chosen on the first half of the
 * year and judged on the second.
 */
function TrendRules() {
  return (
    <>
      <div style={{ color: ORANGE, fontWeight: 700, fontSize: 12, padding: "10px 2px 0", letterSpacing: "0.04em" }}>STRATÉGIE 2 · TRADE WITH TREND</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
        <RuleCard
          num={1}
          title="Le setup"
          detail
          rules={[
            { k: "Tendance", main: "Plusieurs jours dans la même direction", detail: "Au moins 2 séances de suite qui clôturent plus bas que la précédente pour un short (plus haut pour un long). 6E : 3 séances." },
            {
              k: "Zone",
              main: "3 rebonds proches d'un même creux, chacun reparti assez loin",
              detail:
                "3 creux M15 (ou sommets pour un long) à X ticks au plus d'un même creux de référence — la zone fait donc jusqu'à 2 × X (X = 6B, 6N, 6C 13 tk · 6J, ZW 8 tk · 6E, ZN, ZS 6 tk). Entre deux creux, le prix repart d'au moins ⅓ du stop du plan : 6B, 6N, 6C 8 tk · 6J, ZW 5 tk · 6E, ZN, ZS 4 tk (½ du stop avant le 17.11 : trop strict, des zones bien visibles étaient ignorées — ⅓ fait +1 750 $/mois au lieu de +1 093 sur les 8 paires, mieux sur les deux moitiés). 6E : zone large seulement (plus de X).",
            },
            { k: "Cassure", main: "Une bougie H1 clôture au-delà de la zone, dans le sens de la tendance", detail: "La première clôture H1 de l'autre côté. Testé : 2 clôtures, une mèche, un corps entier, une bougie forte ou un temps passé sous la zone ne font pas mieux ; entrer dès la cassure ou au 1er retour perd." },
            {
              k: "1er retour",
              main: "Le prix revient sur la zone et repart dans le sens de la tendance",
              detail:
                "Lu en M15, dans les 72 h après la cassure. Il doit repartir d'au moins un stop du plan, mesuré depuis le bord de la zone : 6B 13 tk (½ stop, réglage propre) · 6N, 6C 25 tk · 6J 23 tk (1,5 stop, réglage propre) · ZW 15 tk · 6E, ZN, ZS 12 tk. Mesuré depuis le haut du retour, ça prend trop de mauvaises zones. Si une bougie M15 clôture de nouveau de l'autre côté de la zone, la cassure a échoué.",
            },
            { k: "Entrée", main: "Au 2e retour sur la zone, ordre limite 1 tick avant le bord, dans le sens de la tendance", detail: "Dans les 48 h après le 1er retour, aux heures d'ordres de la paire, pas d'ordre rempli à ±10 min d'une news 3★ de ses devises. Un trade par jour et par paire ; une zone ne sert qu'une fois." },
          ]}
        />
        <RuleCard
          num={2}
          title="Gestion"
          detail
          rules={[
            { k: "Stop", main: "3 ticks au-delà de l'autre bord de la zone", detail: "Pas de trade si ce stop dépasse 500 $ à 2 lots." },
            { k: "Objectif", main: "1,5 fois le risque (6E : 1,25)", detail: "Testé : 1R, 1,25R, 2R, break-even, sortie de moitié, trailing stop (distance fixe, creux M15 ou H1, gardé jusqu'à 3 jours) — rien ne fait mieux sur la 1re moitié. 6E : 1,25R avec une tendance sur 3 séances et une zone large, 64 % de gagnants." },
            { k: "Durée", main: "4 h au plus, rien après 16h Chicago" },
            { k: "Journal", main: "Stratégie « Trade with Trend »", detail: "Pour mesurer tes vrais résultats : c'est eux qui diront si on l'ajoute au plan." },
          ]}
        />
        <RuleCard
          num={3}
          title="Ce que dit le backtest"
          detail
          rules={[
            { k: "Réglage", main: "Zone et retours en M15, cassure en H1 · règle du 17.11", detail: "Un an (13.11.2025 → 12.11.2026), news bloquées ±10 min, frais déduits, choisi sur la 1re moitié et jugé sur la 2e." },
            { k: "Où ça marche", main: "6J · 6E · ZS · 6B", detail: "$/mois (1re → 2e moitié) : 6J +372 → +304 (67 %, DD 539) · 6E +195 → +349 (64 %) · ZS +601 → +358 · 6B +626 → +239 (57 %). Pas vraiment : ZN +20 → +423, ZW +82 → +193, 6C +220 → −46, 6N +141 → −75." },
            { k: "Portefeuilles", main: "6J + 6E : 7,4 trades/mois, 65 %, +610 $/mois, DD 845", detail: "6J + 6E + ZS : 12,3 trades/mois, 60 %, +1 089 $/mois, DD 1 096, pire jour −577. Avec 6B en plus : +1 522 $/mois mais DD 1 651 et pire jour −821. Les 8 paires : DD 2 324, au-delà du compte. Avec les zones : voir COMBINÉ." },
            { k: "Statut", main: "À l'essai : à confirmer en réel", detail: "Les paires faibles (6N, 6C, ZW) n'ont pas de réglage qui tienne sur la 2e moitié ; les réglages propres à une paire sont limités à ceux qui tiennent." },
          ]}
        />
      </div>
    </>
  );
}

// ---- Trade with Trend -------------------------------------------------------

/** End-of-day drawdown on closed trades: the deepest fall of the closing balance from its peak. */
function eodDrawdown(list: { t: number; pnl: number }[]) {
  const days = new Map<number, number>();
  for (const x of list) days.set(sessionDay(x.t), (days.get(sessionDay(x.t)) ?? 0) + x.pnl);
  let bal = 0, peak = 0, dd = 0, worst = 0;
  for (const d of [...days.keys()].sort((a, b) => a - b)) {
    const v = days.get(d)!;
    worst = Math.min(worst, v);
    bal += v;
    dd = Math.max(dd, peak - bal);
    peak = Math.max(peak, bal);
  }
  return { dd, worst, days };
}

/**
 * The second strategy's report: every pair tested, the ones switched on
 * counting in the totals; the months of the pairs on; a pair's trades.
 */
function TrendReport({ trend, on, onToggle }: { trend: TrendResults | null; on: string[]; onToggle: (symbol: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [openT, setOpenT] = useState<string | null>(null);
  if (!trend || !trend.pairs.length)
    return (
      <Panel title="TRADE WITH TREND">
        <div style={{ padding: 10, color: DIM }}>Pas encore de résultats : le backtest se lance hors du site (scripts/trend-analyse.ts).</div>
      </Panel>
    );
  const from = Math.min(...trend.pairs.map((p) => p.from)), to = Math.max(...trend.pairs.map((p) => p.to));
  const span = spanMonths({ from, to }), mid = (from + to) / 2;
  const stats = trend.pairs.map((p) => {
    const list = p.trades.map((x) => ({ t: x[0] * 60000, pnl: x[9] }));
    const sum = (l: typeof list) => l.reduce((a, x) => a + x.pnl, 0);
    return {
      p,
      on: on.includes(p.symbol),
      n: list.length,
      wins: list.filter((x) => x.pnl > 0).length,
      pnl: sum(list),
      h1: sum(list.filter((x) => x.t < mid)) / (span / 2),
      h2: sum(list.filter((x) => x.t >= mid)) / (span / 2),
      dd: eodDrawdown(list).dd,
    };
  });
  const active = stats.filter((x) => x.on);
  const all = active.flatMap((x) => x.p.trades.map((r) => ({ t: r[0] * 60000, pnl: r[9] })));
  const n = all.length, wins = all.filter((x) => x.pnl > 0).length, pnl = all.reduce((a, x) => a + x.pnl, 0);
  const acc = eodDrawdown(all);
  const months = monthsBetween(from, to);
  const byMonth = new Map<string, { n: number; wins: number; pnl: number }>();
  for (const x of all) {
    const b = byMonth.get(monthOf(x.t)) ?? { n: 0, wins: 0, pnl: 0 };
    b.n++;
    b.pnl += x.pnl;
    if (x.pnl > 0) b.wins++;
    byMonth.set(monthOf(x.t), b);
  }
  const monthMax = Math.max(1, ...[...byMonth.values()].map((b) => Math.abs(b.pnl)));
  const kpis = [
    { label: "P&L/MOIS · PAIRES ACTIVES", value: short(pnl / span), color: tone(pnl), sub: `${active.map((x) => x.p.symbol).join(" · ") || "AUCUNE"} · FRAIS DÉDUITS` },
    { label: "TRADES/MOIS", value: (n / span).toFixed(1).replace(".", ","), color: TXT, sub: `${n} SUR LA PÉRIODE` },
    { label: "WIN%", value: n ? `${Math.round((wins / n) * 100)}` : "—", color: TXT, sub: "OBJECTIF 1,5 × LE STOP (6E : 1,25) · NEWS ±10 MIN" },
    { label: "MAX DD", value: `−${Math.round(acc.dd)}`, color: LOSS, sub: "FIN DE JOURNÉE, PAIRES ACTIVES" },
    { label: "PIRE JOUR", value: short(acc.worst), color: LOSS, sub: "PAIRES ACTIVES" },
    { label: "RÈGLE", value: trend.rule, color: ORANGE, sub: "ZONE · CASSURE · RETOUR" },
  ];
  const cols = "52px 92px 56px 46px 1fr 70px 70px 70px 64px 96px";
  const p = sel ? trend.pairs.find((x) => x.symbol === sel) : null;
  // The trades shown: the pair clicked, or the active pairs; only the month clicked, if one is.
  const shown = (p ? [p] : month ? active.map((x) => x.p) : [])
    .flatMap((q) => q.trades.map((x) => ({ q, x })))
    .filter(({ x }) => !month || monthOf(x[0] * 60000) === month)
    .sort((a, b) => b.x[0] - a.x[0]);
  const shownPnl = shown.reduce((a, { x }) => a + x[9], 0);
  const tradeCols = "38px 92px 46px 22px minmax(170px, 1fr) 76px 76px 76px 44px 64px";
  return (
    <>
      <KpiStrip kpis={kpis} />
      <Panel title="PAIRES · TRADE WITH TREND" right="SEULES LES PAIRES ACTIVES COMPTENT · CLIC = TRADES">
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 860 }}>
            <Row head cols={cols}>
              <span>PAIRE</span>
              <span>ÉTAT</span>
              <span style={R}>TR/MOIS</span>
              <span style={R}>WIN</span>
              <span />
              <span style={R}>P&L/MOIS</span>
              <span style={R}>1RE MOITIÉ</span>
              <span style={R}>2E MOITIÉ</span>
              <span style={R}>DD</span>
              <span />
            </Row>
            {[...stats].sort((a, b) => Number(b.on) - Number(a.on) || b.pnl - a.pnl).map((x) => {
              const mo = x.pnl / span;
              return (
                <Row
                  key={x.p.symbol}
                  cols={cols}
                  onClick={() => setSel(sel === x.p.symbol ? null : x.p.symbol)}
                  style={{ ...(sel === x.p.symbol ? { background: "#1F1608", boxShadow: `inset 3px 0 0 ${ORANGE}` } : {}), ...(x.on ? {} : { opacity: 0.5 }) }}
                >
                  <span style={{ color: TXT, fontWeight: 700 }}>{x.p.symbol}</span>
                  <span style={{ color: x.on ? GAIN : DIM, fontWeight: 700, fontSize: 11 }}>{x.on ? "● ACTIVE" : "○ DÉSACTIVÉE"}</span>
                  <span style={R}>{(x.n / span).toFixed(1).replace(".", ",")}</span>
                  <span style={{ ...R, color: DIM }}>{x.n ? `${Math.round((x.wins / x.n) * 100)}%` : "–"}</span>
                  <span style={bar((Math.abs(mo) / Math.max(1, ...stats.map((y) => Math.abs(y.pnl / span)))) * 100, tone(mo))} />
                  <span style={{ ...R, color: tone(mo), fontWeight: 700 }}>{short(mo)}</span>
                  <span style={{ ...R, color: tone(x.h1) }}>{short(x.h1)}</span>
                  <span style={{ ...R, color: tone(x.h2) }}>{short(x.h2)}</span>
                  <span style={{ ...R, color: LOSS }}>−{Math.round(x.dd)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onToggle(x.p.symbol);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onToggle(x.p.symbol);
                      }
                    }}
                    style={{ cursor: "pointer", textAlign: "center", fontSize: 10, fontWeight: 700, padding: "2px 0", border: `1px solid ${x.on ? "#555" : GAIN}`, color: x.on ? "#AAA" : GAIN }}
                  >
                    {x.on ? "DÉSACTIVER" : "ACTIVER"}
                  </span>
                </Row>
              );
            })}
          </div>
        </div>
        <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A", lineHeight: 1.6 }}>
          P&L À 2 LOTS, FRAIS DÉDUITS · MOITIÉS = 1RE ET 2E MOITIÉ DE LA PÉRIODE ($/MOIS) · DD = FIN DE JOURNÉE, LA PAIRE SEULE · LES RÉGLAGES ONT ÉTÉ CHOISIS SUR LA 1RE MOITIÉ : LA 2E EST LE
          TEST HONNÊTE · RÉSULTATS SENSIBLES AUX DÉTAILS DE LA RÈGLE, À CONFIRMER EN RÉEL
        </div>
      </Panel>

      <div className="term-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.6fr)", gap: 8 }}>
        <Panel title="MOIS · PAIRES ACTIVES" right="CLIC = TRADES DU MOIS">
          <Row head cols="62px 28px 40px 1fr 54px">
            <span>MOIS</span>
            <span style={R}>TR</span>
            <span style={R}>WIN</span>
            <span />
            <span style={R}>P&L</span>
          </Row>
          {[...months].reverse().map((m) => {
            const b = byMonth.get(m);
            return (
              <Row
                key={m}
                cols="62px 28px 40px 1fr 54px"
                onClick={b ? () => setMonth(month === m ? null : m) : undefined}
                style={month === m ? { background: "#1F1608", boxShadow: `inset 3px 0 0 ${ORANGE}` } : undefined}
              >
                <span style={{ color: DIM }}>{termMonth(m)}</span>
                <span style={R}>{b ? b.n : "–"}</span>
                <span style={{ ...R, color: DIM }}>{b ? `${Math.round((b.wins / b.n) * 100)}%` : ""}</span>
                <span style={b ? bar((Math.abs(b.pnl) / monthMax) * 100, tone(b.pnl)) : { display: "block" }} />
                <span style={{ ...R, color: b ? tone(b.pnl) : "#444", fontWeight: 600 }}>{b ? short(b.pnl) : "–"}</span>
              </Row>
            );
          })}
        </Panel>

        <Panel
          title={`TRADES · ${p ? p.symbol : month ? "PAIRES ACTIVES" : "CLIQUE UNE PAIRE OU UN MOIS"}${month ? ` · ${termMonth(month)}` : ""}`}
          right={p || month ? `${shown.length} TRADES · ${short(shownPnl)}` : undefined}
        >
          {month && (
            <div style={{ padding: "4px 10px", borderBottom: "1px solid #1A1A1A" }}>
              <button type="button" onClick={() => setMonth(null)} style={{ cursor: "pointer", background: "none", border: 0, padding: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: ORANGE }}>
                × TOUS LES MOIS
              </button>
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 800 }}>
              <Row head cols={tradeCols}>
                <span>PAIRE</span>
                <span>OUVERT</span>
                <span>FERMÉ</span>
                <span>S</span>
                <span style={R}>ZONE</span>
                <span style={R}>ENTRÉE</span>
                <span style={R}>SL</span>
                <span style={R}>TP</span>
                <span style={R}>TK</span>
                <span style={R}>P&L</span>
              </Row>
              {shown.map(({ q, x }) => (
                <TrendTradeRow key={`${q.symbol}${x[0]}`} q={q} x={x} cols={tradeCols} pair open={openT === `${q.symbol}${x[0]}`} onClick={() => setOpenT(openT === `${q.symbol}${x[0]}` ? null : `${q.symbol}${x[0]}`)} />
              ))}
              {!p && !month && <div style={{ color: DIM, padding: "12px 10px" }}>CLIQUE UNE PAIRE OU UN MOIS POUR VOIR SES TRADES.</div>}
              {(p || month) && !shown.length && <div style={{ color: DIM, padding: "12px 10px" }}>AUCUN TRADE.</div>}
            </div>
          </div>
          <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A" }}>HEURES CT · TK = TICKS PAR CONTRAT · P&L À 2 LOTS, FRAIS DÉDUITS · CLIC SUR UN TRADE = SA JUSTIFICATION</div>
        </Panel>
      </div>
    </>
  );
}

/** The second strategy's screens, as function keys: all pairs, one pair, the rules. */
function TrendScreens({
  trend,
  on,
  onToggle,
  entries,
  account,
  berlinShift,
}: {
  trend: TrendResults | null;
  on: string[];
  onToggle: (symbol: string) => void;
  entries: Entry[];
  account: AccountRules;
  berlinShift: number;
}) {
  const [view, setView] = useState("all");
  const pairs = trend ? [...trend.pairs].sort((a, b) => a.symbol.localeCompare(b.symbol)) : [];
  const keys = [{ id: "all", label: "VUE" }, ...pairs.map((p) => ({ id: p.symbol, label: p.symbol })), { id: "rules", label: "RÈGLES" }];
  const pair = pairs.find((p) => p.symbol === view) ?? null;
  const screen = view === "rules" ? "rules" : pair ? pair.symbol : "all";
  return (
    <>
      <div role="toolbar" aria-label="Écrans Trade with Trend" style={{ display: "flex", flexWrap: "wrap", border: "1px solid #2E2E2E" }}>
        {keys.map((k, i) => {
          const sel = screen === k.id;
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={sel}
              onClick={() => setView(k.id)}
              style={{
                cursor: "pointer",
                padding: "6px 12px",
                border: 0,
                borderRight: "1px solid #1A1A1A",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                background: sel ? ORANGE : "#000",
                color: sel ? "#000" : k.id !== "all" && k.id !== "rules" && !on.includes(k.id) ? "#666" : "#CCC",
              }}
            >
              <span style={{ color: sel ? "#000" : ORANGE }}>F{i + 1}</span> {k.label}
            </button>
          );
        })}
      </div>
      {screen === "all" && <TrendReport trend={trend} on={on} onToggle={onToggle} />}
      {screen === "rules" && <TrendRules />}
      {pair && (
        <TrendPair
          key={pair.symbol}
          p={pair}
          on={on.includes(pair.symbol)}
          onToggle={() => onToggle(pair.symbol)}
          entry={entries.find((e) => e.symbol === pair.symbol) ?? null}
          account={account}
          berlinShift={berlinShift}
        />
      )}
    </>
  );
}

/** One pair under Trade with Trend: its figures, its rule in ticks, its months, a month's trades, where it wins. */
function TrendPair({
  p,
  on,
  onToggle,
  entry,
  account,
  berlinShift,
}: {
  p: TrendResults["pairs"][number];
  on: boolean;
  onToggle: () => void;
  entry: Entry | null;
  account: AccountRules;
  berlinShift: number;
}) {
  const span = spanMonths({ from: p.from, to: p.to }), mid = (p.from + p.to) / 2;
  const months = monthsBetween(p.from, p.to);
  const list = p.trades.map((x) => ({ x, t: x[0] * 60000, pnl: x[9] }));
  const byMonth = new Map<string, { n: number; wins: number; pnl: number }>();
  for (const it of list) {
    const m = monthOf(it.t);
    const b = byMonth.get(m) ?? { n: 0, wins: 0, pnl: 0 };
    b.n++;
    b.pnl += it.pnl;
    if (it.pnl > 0) b.wins++;
    byMonth.set(m, b);
  }
  const traded = months.filter((m) => byMonth.has(m));
  const [month, setMonth] = useState<string | null>(traded[traded.length - 1] ?? null);
  const [openT, setOpenT] = useState<number | null>(null);
  const n = list.length, wins = list.filter((it) => it.pnl > 0).length, pnl = list.reduce((a, it) => a + it.pnl, 0);
  const { dd, worst } = eodDrawdown(list);
  const ticksOf = (v: number) => Math.round(v / p.tick);
  const avg = (f: (x: number[]) => number) => (n ? Math.round(list.reduce((a, it) => a + f(it.x), 0) / n) : 0);
  const stopTk = avg((x) => ticksOf(Math.abs(x[5] - x[6])));
  const tpTk = avg((x) => ticksOf(Math.abs(x[7] - x[5])));
  const r = entry?.result ?? null;
  const sl = p.params?.sl ?? r?.top[0]?.cfg.sl ?? null;
  const money = r ? r.tickValue * r.settings.lots : null;
  const lots = r?.settings.lots ?? 2;
  const X = sl ? Math.max(2, Math.round(sl * 0.5)) : null;
  const bounceTk = sl ? Math.round(sl * (p.params?.bounce ?? 0.5) * 10) / 10 : null;
  const awayTk = sl ? Math.round(sl * (p.params?.away ?? 1)) : null;
  // What differs from the rule every pair shares, said once beside the trend.
  const own = [
    (p.params?.days ?? 2) !== 2 && `TENDANCE ${p.params!.days} SÉANCES`,
    p.params?.wide && "ZONE LARGE SEULEMENT",
    (p.params?.away ?? 1) !== 1 && `1ER RETOUR ${rText(p.params!.away!)} STOP`,
    (p.params?.exit ?? 1.5) !== 1.5 && `OBJECTIF ${rText(p.params!.exit)}R`,
  ].filter(Boolean);
  const hours = r?.rules?.excludeHours ?? [];
  const spans = orderSpans(r?.rules?.hours ?? [2, 14], hours);
  const posMonths = [...byMonth.values()].filter((b) => b.pnl > 0).length;
  const kpis = [
    { label: `P&L/MOIS · ${p.symbol}`, value: short(pnl / span), color: tone(pnl), sub: `${short(pnl)} SUR LA PÉRIODE · ${on ? "ACTIVE" : "DÉSACTIVÉE"}` },
    { label: "TRADES/MOIS", value: (n / span).toFixed(1).replace(".", ","), color: TXT, sub: "AU 2E RETOUR SUR LA ZONE" },
    { label: "WIN%", value: n ? ((wins / n) * 100).toFixed(1).replace(".", ",") : "—", color: TXT, sub: `${posMonths}/${byMonth.size} MOIS POSITIFS` },
    { label: "MAX DD", value: short(-dd), color: LOSS, sub: account.ddLimit ? `${Math.round((dd / account.ddLimit) * 100)}% DE LA LIMITE · PIRE JOUR ${short(worst)}` : "FIN DE JOURNÉE" },
    { label: "STOP MOYEN", value: `${stopTk} TK`, color: LOSS, sub: money ? `≈ ${Math.round(stopTk * money)} $ À ${lots} LOTS · ZONE + 3 TK` : "ZONE + 3 TK" },
    { label: "OBJECTIF MOYEN", value: `${tpTk} TK`, color: GAIN, sub: `${rText(p.params?.exit ?? 1.5)} × LE RISQUE · 4 H MAX` },
  ];
  // Where it wins: the side, the halves, the hour of entry.
  const group = (key: (it: (typeof list)[number]) => string) => {
    const g = new Map<string, { n: number; wins: number; pnl: number }>();
    for (const it of list) {
      const k = key(it);
      const b = g.get(k) ?? { n: 0, wins: 0, pnl: 0 };
      b.n++;
      b.pnl += it.pnl;
      if (it.pnl > 0) b.wins++;
      g.set(k, b);
    }
    return g;
  };
  const sides = group((it) => (it.x[2] === 1 ? "LONGS" : "SHORTS"));
  const halves = group((it) => (it.t < mid ? "1RE MOITIÉ" : "2E MOITIÉ"));
  const byHour = group((it) => ctTime(it.t).time.slice(0, 2));
  const splitRows = [
    ...["LONGS", "SHORTS"].map((k) => ({ k, b: sides.get(k) })),
    ...["1RE MOITIÉ", "2E MOITIÉ"].map((k) => ({ k, b: halves.get(k) })),
    ...[...byHour.keys()].sort().map((h) => ({ k: `${h}H CT · ${String((Number(h) + berlinShift + 24) % 24).padStart(2, "0")}H BER`, b: byHour.get(h) })),
  ];
  const splitMax = Math.max(1, ...splitRows.map((x) => Math.abs(x.b?.pnl ?? 0)));
  const monthMax = Math.max(1, ...[...byMonth.values()].map((b) => Math.abs(b.pnl)));
  const rows = month ? list.filter((it) => monthOf(it.t) === month).sort((a, b) => b.t - a.t) : [];
  const mb = month ? byMonth.get(month) : null;
  const tradeCols = "92px 46px 22px minmax(170px, 1fr) 76px 76px 76px 44px 64px";
  const line = (k: string, v: React.ReactNode, note?: React.ReactNode) => (
    <div>
      <span style={{ color: DIM }}>{k} </span>
      <span style={{ color: TXT }}>{v}</span>
      {note && <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.4, marginBottom: 3 }}>{note}</div>}
    </div>
  );
  return (
    <>
      <KpiStrip kpis={kpis} />
      <div className="term-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 1.5fr)", gap: 8 }}>
        <Panel title={`RÈGLE ${p.symbol} · TRADE WITH TREND`} right={`${fmtDay(p.from)} → ${fmtDay(p.to)}`}>
          <div style={{ padding: "8px 10px", lineHeight: 1.9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: DIM }}>ÉTAT </span>
              <span style={{ color: on ? GAIN : DIM, fontWeight: 700 }}>{on ? "● ACTIVE" : "○ DÉSACTIVÉE"}</span>
              <button
                type="button"
                onClick={onToggle}
                style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700, padding: "1px 8px", background: "#000", border: `1px solid ${on ? "#555" : GAIN}`, color: on ? "#AAA" : GAIN }}
              >
                {on ? "DÉSACTIVER" : "ACTIVER"}
              </button>
            </div>
            {line(
              "TENDANCE",
              `${p.params?.days ?? 2} SÉANCES DE SUITE`,
              `CLÔTURES PLUS BASSES (SHORT) OU PLUS HAUTES (LONG)${own.length ? ` · RÉGLAGE PROPRE À ${p.symbol} : ${own.join(", ")}` : ""}`
            )}
            {line(
              "ZONE",
              X ? `3 REBONDS M15 À ${X} TK AU PLUS` : "3 REBONDS M15",
              X ? `ZONE ≤ ${2 * X} TK${p.params?.wide ? ` ET > ${X} TK (ZONE LARGE)` : ""} · CHAQUE REBOND ≥ ${String(bounceTk).replace(".", ",")} TK` : undefined
            )}
            {line("CASSURE", "1RE CLÔTURE H1 AU-DELÀ DE LA ZONE")}
            {line("1ER RETOUR", awayTk ? `M15, REPART D'AU MOINS ${awayTk} TK SOUS LE BORD` : "M15, REPART D'UN STOP", "MESURÉ DEPUIS LE BORD DE LA ZONE · DANS LES 72 H · CLÔTURE M15 DE L'AUTRE CÔTÉ = ÉCHEC")}
            {line("ENTRÉE", "2E RETOUR · LIMITE 1 TK AVANT LA ZONE", "DANS LES 48 H · 1 TRADE/JOUR · ZONE UTILISÉE UNE FOIS")}
            <div>
              <span style={{ color: DIM }}>STOP </span>
              <span style={{ color: LOSS }}>3 TK AU-DELÀ DE L&apos;AUTRE BORD</span>
              <span style={{ color: DIM }}> · ≤ 500 $ À {lots} LOTS</span>
            </div>
            <div>
              <span style={{ color: DIM }}>OBJECTIF </span>
              <span style={{ color: GAIN }}>{rText(p.params?.exit ?? 1.5)} × LE RISQUE</span>
              <span style={{ color: DIM }}> · 4 H MAX, RIEN APRÈS 16H CT</span>
            </div>
            <div>
              <span style={{ color: DIM }}>HORAIRES </span>
              <span style={{ color: ORANGE }}>{spansText(spans)} CT</span>
              <span style={{ color: DIM }}> · </span>
              <span style={{ color: TXT }}>{spansText(spans, berlinShift)} BERLIN</span>
            </div>
            {line("BLACKOUT", hours.length ? `${hoursText(hours).toUpperCase()} CT` : "AUCUNE HEURE", `MÊMES HEURES QUE LES ZONES · PAS D'ORDRE REMPLI À ±${p.params?.news ?? 10} MIN D'UNE NEWS 3★`)}
          </div>
          <div style={{ padding: "2px 10px 10px" }}>
            <div style={{ color: DIM, fontSize: 10.5, marginBottom: 4 }}>RISQUE / GAIN EN TICKS (MOYENNE)</div>
            <div style={{ display: "flex", height: 10 }}>
              <span style={{ display: "block", width: `${((stopTk / Math.max(1, stopTk + tpTk)) * 100).toFixed(1)}%`, background: LOSS }} />
              <span style={{ width: 2, background: "#FFF" }} />
              <span style={{ display: "block", flex: 1, background: GAIN }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginTop: 3 }}>
              <span style={{ color: LOSS }}>−{stopTk}</span>
              <span>ENTRÉE</span>
              <span style={{ color: GAIN }}>+{tpTk}</span>
            </div>
          </div>
        </Panel>

        <Panel title="MOIS" right="CLIC = TRADES">
          <Row head cols="62px 28px 40px 1fr 54px">
            <span>MOIS</span>
            <span style={R}>TR</span>
            <span style={R}>WIN</span>
            <span />
            <span style={R}>P&L</span>
          </Row>
          {[...months].reverse().map((m) => {
            const b = byMonth.get(m);
            const sel = m === month;
            return (
              <Row
                key={m}
                cols="62px 28px 40px 1fr 54px"
                onClick={b ? () => setMonth(sel ? null : m) : undefined}
                style={sel ? { background: ORANGE, color: "#000" } : undefined}
              >
                <span style={{ color: sel ? "#000" : DIM, fontWeight: sel ? 700 : 400 }}>{termMonth(m)}</span>
                <span style={R}>{b ? b.n : "–"}</span>
                <span style={{ ...R, color: sel ? "#000" : DIM }}>{b ? `${Math.round((b.wins / b.n) * 100)}%` : ""}</span>
                <span style={b ? bar((Math.abs(b.pnl) / monthMax) * 100, tone(b.pnl)) : { display: "block" }} />
                <span style={{ ...R, color: sel ? "#000" : b ? tone(b.pnl) : "#444", fontWeight: 600 }}>{b ? short(b.pnl) : "–"}</span>
              </Row>
            );
          })}
        </Panel>

        <Panel
          title={`TRADES · ${month ? termMonth(month) : "CLIQUE UN MOIS"}`}
          right={mb ? `${mb.n} TR · ${Math.round((mb.wins / mb.n) * 100)}% · ${short(mb.pnl)} $` : undefined}
        >
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 760 }}>
              <Row head cols={tradeCols}>
                <span>OUVERT</span>
                <span>FERMÉ</span>
                <span>S</span>
                <span style={R}>ZONE</span>
                <span style={R}>ENTRÉE</span>
                <span style={R}>SL</span>
                <span style={R}>TP</span>
                <span style={R}>TK</span>
                <span style={R}>P&L</span>
              </Row>
              {rows.map(({ x }) => (
                <TrendTradeRow key={x[0]} q={p} x={x} cols={tradeCols} open={openT === x[0]} onClick={() => setOpenT(openT === x[0] ? null : x[0])} />
              ))}
              {!month && <div style={{ color: DIM, padding: "12px 10px" }}>CLIQUE UN MOIS POUR VOIR SES TRADES.</div>}
            </div>
          </div>
          <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A" }}>HEURES CT · TK = TICKS PAR CONTRAT · P&L À {lots} LOTS, FRAIS DÉDUITS · CLIC SUR UN TRADE = SA JUSTIFICATION</div>
        </Panel>
      </div>

      <Panel title={`OÙ ${p.symbol} GAGNE · SENS, MOITIÉS, HEURE D'ENTRÉE`} right="P&L SUR LA PÉRIODE, FRAIS DÉDUITS">
        <Row head cols="200px 40px 48px 1fr 70px 64px">
          <span />
          <span style={R}>TR</span>
          <span style={R}>WIN</span>
          <span />
          <span style={R}>P&L</span>
          <span style={R}>MOY/TR</span>
        </Row>
        {splitRows.map(({ k, b }, i) => (
          <Row key={k} cols="200px 40px 48px 1fr 70px 64px" style={i === 2 || i === 4 ? { borderTop: "1px solid #2E2E2E" } : undefined}>
            <span style={{ color: TXT, fontWeight: 700 }}>{k}</span>
            <span style={R}>{b ? b.n : "–"}</span>
            <span style={{ ...R, color: DIM }}>{b ? `${Math.round((b.wins / b.n) * 100)}%` : ""}</span>
            <span style={b ? bar((Math.abs(b.pnl) / splitMax) * 100, tone(b.pnl)) : { display: "block" }} />
            <span style={{ ...R, color: b ? tone(b.pnl) : "#444", fontWeight: 700 }}>{b ? short(b.pnl) : "–"}</span>
            <span style={{ ...R, color: b ? tone(b.pnl) : "#444" }}>{b ? short(b.pnl / b.n) : ""}</span>
          </Row>
        ))}
        <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A", lineHeight: 1.6 }}>
          MOITIÉS = 1RE ET 2E MOITIÉ DE LA PÉRIODE · LES RÉGLAGES ONT ÉTÉ CHOISIS SUR LA 1RE : LA 2E EST LE TEST HONNÊTE · MOINS DE 6 TRADES : TROP PEU POUR JUGER
        </div>
      </Panel>
    </>
  );
}

/** A trade with Trend row; clicked, the steps that made it, from the trend to the exit. */
function TrendTradeRow({ q, x, cols, pair, open, onClick }: { q: TrendResults["pairs"][number]; x: number[]; cols: string; pair?: boolean; open: boolean; onClick: () => void }) {
  const o = ctTime(x[0] * 60000);
  const px = (v: number) => fmtPrice(v, q.symbol, q.tick);
  return (
    <>
      <Row cols={cols} onClick={onClick} style={open ? { background: "#1F1608", boxShadow: `inset 3px 0 0 ${ORANGE}` } : undefined}>
        {pair && <span style={{ color: TXT, fontWeight: 700 }}>{q.symbol}</span>}
        <span style={{ color: DIM }}>
          {o.date} {o.time}
        </span>
        <span style={{ color: DIM }}>{ctTime(x[1] * 60000).time}</span>
        <span style={{ color: x[2] === 1 ? buyColor : sellColor, fontWeight: 700 }}>{x[2] === 1 ? "B" : "S"}</span>
        <span style={R}>
          {px(x[3])} – {px(x[4])}
        </span>
        <span style={{ ...R, color: TXT }}>{px(x[5])}</span>
        <span style={{ ...R, color: LOSS }}>{px(x[6])}</span>
        <span style={{ ...R, color: GAIN }}>{px(x[7])}</span>
        <span style={{ ...R, color: tone(x[8]) }}>{String(x[8]).replace(".", ",")}</span>
        <span style={{ ...R, color: tone(x[9]), fontWeight: 700 }}>{short(x[9])}</span>
      </Row>
      {open && <TrendWhyPanel q={q} x={x} />}
    </>
  );
}

const WEEKDAY = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
/** "lun. 19.10 08:00 CT · 15:00 BER", from minutes. */
function whenText(m: number) {
  const t = m * 60000;
  const c = ctTime(t);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(t);
  const wd = WEEKDAY[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day)];
  const ber = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(t);
  return `${wd} ${c.date} ${c.time} CT · ${ber} BER`;
}

/** The steps of one Trade with Trend trade, in the order the rules ask for them. */
function TrendWhyPanel({ q, x }: { q: TrendResults["pairs"][number]; x: number[] }) {
  const why = q.why?.[q.trades.indexOf(x)];
  const px = (v: number) => fmtPrice(v, q.symbol, q.tick);
  const dir = x[2];
  const [lo, hi, entry, sl, tp, ticks, pnl] = [x[3], x[4], x[5], x[6], x[7], x[8], x[9]];
  const tk = (v: number) => Math.round(Math.abs(v) / q.tick);
  const slTk = tk(entry - sl), tpTk = tk(tp - entry);
  const exit = Math.abs(ticks - tpTk) < 0.01 ? "OBJECTIF TOUCHÉ" : Math.abs(ticks + slTk) < 0.01 ? "STOP TOUCHÉ" : "FIN DU TEMPS (4 H MAX OU 16H CT)";
  const side = dir === 1 ? "LONG" : "SHORT";
  const edge = dir === 1 ? hi : lo, far = dir === 1 ? lo : hi;
  const step = (n: number, k: string, main: React.ReactNode, detail?: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "22px 92px 1fr", gap: 8, padding: "3px 0" }}>
      <span style={{ color: ORANGE, fontWeight: 700 }}>{n}</span>
      <span style={{ color: DIM }}>{k}</span>
      <span>
        <span style={{ color: TXT }}>{main}</span>
        {detail && <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.5 }}>{detail}</div>}
      </span>
    </div>
  );
  const dayText = (d: number) => {
    const s = new Date(d * 86400000).toISOString();
    return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  };
  return (
    <div style={{ position: "sticky", left: 0, maxWidth: 490, boxSizing: "border-box", padding: "8px 10px 10px", background: "#0B0B0B", borderBottom: "1px solid #2E2E2E", fontSize: 11.5, lineHeight: 1.6 }}>
      <div style={{ color: ORANGE, fontWeight: 700, marginBottom: 4 }}>
        POURQUOI CE {side} {q.symbol}
      </div>
      {!why && <div style={{ color: DIM }}>Justification absente : relance scripts/trend-analyse.ts.</div>}
      {why && (
        <>
          {step(
            1,
            "TENDANCE",
            <>
              {why.closes.map(([d, c], i) => (
                <span key={d}>
                  {i > 0 && <span style={{ color: DIM }}> → </span>}
                  <span style={{ color: DIM }}>{dayText(d)} </span>
                  {px(c)}
                </span>
              ))}
            </>,
            `${why.closes.length - 1} CLÔTURES DE SÉANCE DE SUITE PLUS ${dir === 1 ? "HAUTES" : "BASSES"} : TENDANCE ${dir === 1 ? "HAUSSIÈRE, LONGS SEULEMENT" : "BAISSIÈRE, SHORTS SEULEMENT"}`
          )}
          {step(
            2,
            "ZONE",
            <>
              {px(lo)} – {px(hi)} <span style={{ color: DIM }}>({tk(hi - lo)} TK)</span>
            </>,
            <>
              {why.touches.length} {dir === 1 ? "SOMMETS" : "CREUX"} M15 : {why.touches.map((t) => whenText(t).split(" · ")[0]).join(" · ")}
            </>
          )}
          {step(3, "CASSURE", whenText(why.brk), `LA BOUGIE H1 CLÔTURE ${dir === 1 ? "AU-DESSUS DE" : "SOUS"} ${px(edge)}`)}
          {step(
            4,
            "1ER RETOUR",
            whenText(why.ret),
            `LE PRIX REVIENT SUR ${px(edge)}, PUIS REPART ${dir === 1 ? "VERS LE HAUT" : "VERS LE BAS"} D'AU MOINS ${q.params?.sl ? `${Math.round(q.params.sl * (q.params.away ?? 1))} TICKS` : "UN STOP"} AU-DELÀ DU BORD : ZONE PRÊTE ${whenText(why.ready)}`
          )}
          {step(5, "ENTRÉE", <>{whenText(x[0])} · {side} À {px(entry)}</>, `2E RETOUR · ORDRE LIMITE 1 TICK AVANT LA ZONE (${px(edge)})`)}
          {step(
            6,
            "STOP · OBJ.",
            <>
              <span style={{ color: LOSS }}>{px(sl)}</span> ({slTk} TK) · <span style={{ color: GAIN }}>{px(tp)}</span> ({tpTk} TK)
            </>,
            `STOP 3 TICKS AU-DELÀ DE L'AUTRE BORD (${px(far)}) · OBJECTIF ${rText(q.params?.exit ?? 1.5)} × LE RISQUE`
          )}
          {step(
            7,
            "SORTIE",
            <>
              {whenText(x[1])} · <span style={{ color: tone(ticks) }}>{exit}</span>
            </>,
            <span style={{ color: tone(pnl) }}>
              {ticks > 0 ? "+" : ""}
              {String(ticks).replace(".", ",")} TK · {short(pnl)} $ À 2 LOTS, FRAIS DÉDUITS
            </span>
          )}
        </>
      )}
    </div>
  );
}

type Per = { e: Entry; c: ConfigStats; money: number; feeTicks: number };

/**
 * The yearly levels and the trend trades of the pairs switched on, played on
 * one account with its rules: no new trade once the session has lost its
 * daily limit, as many positions at once as the contracts allow, one a pair.
 */
function ComboReport({ trend, on, per, account }: { trend: TrendResults | null; on: string[]; per: Per[]; account: AccountRules }) {
  type Tr = { sym: string; t: number; end: number; pnl: number; s: "N" | "T" };
  const levels: Tr[] = per.flatMap(({ e, c, money, feeTicks }) =>
    c.trades.map((row) => ({ sym: e.symbol, t: row[0] * 60000, end: (row[2] ?? row[0]) * 60000, pnl: (row[1] - feeTicks) * money, s: "N" as const }))
  );
  const twt: Tr[] = (trend?.pairs ?? [])
    .filter((p) => on.includes(p.symbol))
    .flatMap((p) => p.trades.map((x) => ({ sym: p.symbol, t: x[0] * 60000, end: x[1] * 60000, pnl: x[9], s: "T" as const })));
  const lots = per[0]?.e.result?.settings.lots ?? 2;
  const dayStop = account.dailyStop ?? 500;
  const maxPos = account.maxContracts ? Math.max(1, Math.floor(account.maxContracts / lots)) : 2;
  const all = [...levels, ...twt].sort((a, b) => a.t - b.t);
  const kept: Tr[] = [];
  const days = new Map<number, number>();
  let cutDay = 0, cutPos = 0;
  for (const x of all) {
    const d = sessionDay(x.t);
    if ((days.get(d) ?? 0) <= -dayStop) {
      cutDay++;
      continue;
    }
    const open = kept.filter((y) => y.t <= x.t && y.end > x.t);
    if (open.length >= maxPos || open.some((y) => y.sym === x.sym)) {
      cutPos++;
      continue;
    }
    days.set(d, (days.get(d) ?? 0) + x.pnl);
    kept.push(x);
  }
  const { dd, worst } = eodDrawdown(kept);
  const from = Math.min(...kept.map((x) => x.t)), to = Math.max(...kept.map((x) => x.t));
  const span = kept.length ? spanMonths({ from, to }) : 1;
  const sum = (l: Tr[]) => l.reduce((a, x) => a + x.pnl, 0);
  const kN = kept.filter((x) => x.s === "N"), kT = kept.filter((x) => x.s === "T");
  const wins = kept.filter((x) => x.pnl > 0).length;
  const under = [...days.values()].filter((v) => v < -dayStop).length;
  const months = kept.length ? monthsBetween(from, to) : [];
  const cell = (m: string, l: Tr[]) => l.filter((x) => monthOf(x.t) === m).reduce((a, x) => a + x.pnl, 0);
  const limit = account.ddLimit ?? 2000;
  const kpis = [
    { label: "P&L/MOIS · COMBINÉ", value: short(sum(kept) / span), color: tone(sum(kept)), sub: `ZONES ${short(sum(kN) / span)} + TREND ${short(sum(kT) / span)}` },
    { label: "TRADES/MOIS", value: (kept.length / span).toFixed(1).replace(".", ","), color: TXT, sub: `ZONES ${(kN.length / span).toFixed(1).replace(".", ",")} + TREND ${(kT.length / span).toFixed(1).replace(".", ",")}` },
    { label: "WIN%", value: kept.length ? `${Math.round((wins / kept.length) * 100)}` : "—", color: TXT, sub: `${cutPos + cutDay} TRADES ÉCARTÉS PAR LES RÈGLES` },
    { label: "MAX DD", value: `−${Math.round(dd)}`, color: dd > limit ? LOSS : GAIN, sub: `${Math.round((dd / limit) * 100)} % DE LA LIMITE (${limit})` },
    { label: "PIRE JOUR", value: short(worst), color: LOSS, sub: `${under} JOURS SOUS −${dayStop}` },
    { label: "TREND", value: on.length ? on.join(" · ") : "AUCUNE", color: ORANGE, sub: "PAIRES ACTIVES (ONGLET TRADE WITH TREND)" },
  ];
  // Each month's legs and the running total, worked out before the render.
  const rows = months.reduce<{ m: string; z: number; t: number; n: number; cum: number }[]>((acc, m) => {
    const z = cell(m, kN), t = cell(m, kT);
    acc.push({ m, z, t, n: kept.filter((x) => monthOf(x.t) === m).length, cum: (acc[acc.length - 1]?.cum ?? 0) + z + t });
    return acc;
  }, []);
  const rowMax = Math.max(1, ...rows.map((r) => Math.abs(r.z + r.t)));
  return (
    <>
      <KpiStrip kpis={kpis} />
      <Panel title="COMBINÉ · ZONES + TRADE WITH TREND · PAR MOIS" right={`−${dayStop} $/JOUR · ${maxPos} POSITIONS MAX · UNE PAR PAIRE`}>
        <Row head cols="62px 40px 1fr 84px 84px 84px 90px">
          <span>MOIS</span>
          <span style={R}>TR</span>
          <span />
          <span style={R}>ZONES</span>
          <span style={R}>TREND</span>
          <span style={R}>TOTAL</span>
          <span style={R}>CUMUL</span>
        </Row>
        {rows.map(({ m, z, t, n, cum }) => (
          <Row key={m} cols="62px 40px 1fr 84px 84px 84px 90px">
            <span style={{ color: DIM }}>{termMonth(m)}</span>
            <span style={R}>{n}</span>
            <span style={bar((Math.abs(z + t) / rowMax) * 100, tone(z + t))} />
            <span style={{ ...R, color: tone(z) }}>{short(z)}</span>
            <span style={{ ...R, color: tone(t) }}>{short(t)}</span>
            <span style={{ ...R, color: tone(z + t), fontWeight: 700 }}>{short(z + t)}</span>
            <span style={{ ...R, color: tone(cum) }}>{short(cum)}</span>
          </Row>
        ))}
        <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A", lineHeight: 1.6 }}>
          ZONES = TES NIVEAUX ANNUELS (CONFIG RETENUE, ZONES DÉSACTIVÉES EXCLUES) · TREND = LES PAIRES ACTIVES DE TRADE WITH TREND · FRAIS DÉDUITS · DD SUR LES SOLDES DE FIN DE JOURNÉE ·
          LA LIMITE DU JOUR NE COUPE QUE LES NOUVEAUX TRADES
        </div>
      </Panel>
    </>
  );
}
