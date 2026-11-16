"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, lossColor, winColor } from "@/lib/theme";
import { fieldStyle, fmtOffset, fmtUsd, mono, tone } from "@/components/BacktestUi";
import { ratioOf, kindOf, monthOf, OUTCOMES, type ConfigStats, type SymbolResult } from "@/lib/databento/engine";
import { DEFAULT_TIERS, feeRoundTrip, firmShares, fromRow, pairBudget, parseTiers, runAccount, tiersText, type AccountRules } from "@/lib/databento/account";
import { chooseDatabentoConfig } from "@/lib/actions/databento";
import { CONTRACTS, newsCurrencies } from "@/lib/contracts";
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




/** A release that blocks orders: when, whose, what. */
type News = { at: number; currency: string; title: string };

export default function DatabentoClient({ initial, news, now, berlinShift }: { initial: Saved[]; news: News[] | null; now: number; berlinShift: number }) {
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
        </>
      )}

      {analysed.length > 0 && sel && selCfg && screen === sel.symbol && (
        <SymbolReport key={sel.symbol} entry={sel} cfg={selCfg} account={account} news={news} now={now} berlinShift={berlinShift} onChoose={(k) => choisir(sel.symbol, k)} />
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
function Panel({ title, right, children, style }: { title: string; right?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ border: "1px solid #2E2E2E", background: "#000", minWidth: 0, ...style }}>
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
                ? "Chaque news 3 étoiles des devises de la paire, selon la note de TradingView : ce sont celles listées sur la Fiche du jour. Pas toutes les 3 étoiles d'investing.com — Initial Jobless Claims, ADP, JOLTS ou les stocks de pétrole n'en font pas partie (les bloquer aussi coûte ≈ 120 $/mois au backtest)."
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

function SymbolReport({ entry, cfg, account, news, now, berlinShift, onChoose }: { entry: Entry; cfg: ConfigStats; account: AccountRules; news: News[] | null; now: number; berlinShift: number; onChoose: (key: string) => void }) {
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
  const entryText = c.offset === 0 ? "SUR LE NIVEAU" : `${Math.abs(c.offset)} TICK${Math.abs(c.offset) > 1 ? "S" : ""} ${c.offset > 0 ? "AVANT LE" : "AU-DELÀ DU"} NIVEAU`;
  const rows = month ? cfg.trades.filter((t) => monthOf(t[0] * 60000) === month) : [];
  const mb = month ? cfg.months[month] : null;
  const ms = Object.values(cfg.months);
  const far = hasTp2 ? c.tp2 : c.tp1;
  const range = c.sl + far;
  const monthMax = Math.max(1, ...months.map((m) => Math.abs(cfg.months[m]?.pnl ?? 0)));
  const priceCols = hasTp2 ? 5 : 4;
  const priceGrid = `72px repeat(${priceCols}, minmax(0, 1fr)) 12px repeat(${priceCols}, minmax(0, 1fr))`;
  const tradeCols = "92px 46px 22px 70px 70px 70px 70px 1fr 40px 60px";
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
            const on = m === month;
            return (
              <Row
                key={m}
                cols="62px 28px 40px 1fr 54px"
                onClick={b ? () => setMonth(m) : undefined}
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

        <Panel title={`TRADES · ${month ? termMonth(month) : "—"}`} right={mb ? `${mb.n} TR · ${Math.round((mb.wins / mb.n) * 100)}% · ${short(mb.pnl)} $` : "AUCUN TRADE"} style={{ gridColumn: "span 1" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 680 }}>
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
                    <span style={{ color: "#CCC", fontSize: 11.5 }}>
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
              {!rows.length && <div style={{ color: DIM, padding: "12px 10px" }}>AUCUN TRADE CE MOIS</div>}
            </div>
          </div>
          <div style={{ color: DIM, fontSize: 10.5, padding: "6px 10px", borderTop: "1px solid #1A1A1A" }}>
            HEURES CT · TK = TICKS/CONTRAT (MOY. {lots} LOTS) · P&L À {lots} LOTS, AVANT FRAIS
          </div>
        </Panel>
      </div>

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
const HOURS_WHY: Record<string, string> = {
  "6B": "La livre tient ses niveaux pendant Londres ; New York les lui fait traverser.",
  "6E": "L'euro respecte ses niveaux toute la journée.",
  "6J": "L'ouverture de Londres secoue le yen sa première heure.",
  "6N": "Ouverture de Londres, puis chiffres US de 7h30 et ouverture américaine.",
  "6C": "Aucune heure ne fait mieux sans elle.",
  ZN: "Le T-Note est calme, 5 à 10 ticks l'heure.",
  ZS: "La nuit des grains est trop mince : seule la séance du jour compte.",
  ZW: "La réouverture des grains à 8h30 est trop brutale.",
};

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
