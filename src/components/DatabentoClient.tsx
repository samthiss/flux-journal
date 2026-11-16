"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { Figure, Pill, fieldStyle, fmtOffset, fmtUsd, label, mono, monthLabel, td, th, tone } from "@/components/BacktestUi";
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

  return (
    <div>
      {/* ---- Rules ---- */}
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={label}>Ton compte</div>
          <span style={{ ...mono, fontSize: 12, color: "oklch(0.75 0.02 250)" }}>
            {account.copies ?? 1} compte(s) · drawdown {account.ddLimit ?? "—"} $ · {account.dailyStop ?? "—"} $ par jour · {account.maxContracts ?? "—"} contrats ·{" "}
            {account.maxLossPerTrade ?? "—"} $ max par trade
          </span>
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            style={{ ...mono, fontSize: 11.5, marginLeft: "auto", padding: "4px 10px", borderRadius: 5, border: "1px solid oklch(0.34 0.04 250)", background: "transparent", color: "oklch(0.75 0.02 250)", cursor: "pointer" }}
          >
            {rulesOpen ? "Fermer" : "Modifier"}
          </button>
        </div>
        {rulesOpen && (
        <>
        <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8 }}>
          Les règles de ton compte prop firm, appliquées aux rapports ci-dessous sur les trades de toutes les paires ensemble. Les règles de séance
          (1 trade par jour, ordres 1h–15h, clôture 16h, blackout news, heures exclues) ont été appliquées pendant l&apos;analyse.
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
        </>
        )}
      </div>

      {/* ---- Reports ---- */}
      {analysed.length === 0 && (
        <div style={{ ...glassCard, fontSize: 13.5, color: "oklch(0.62 0.03 250)" }}>
          Aucun rapport pour l&apos;instant. L&apos;analyse se fait hors du site (scripts/databento-analyse.ts) et ses rapports sont chargés au
          démarrage du serveur.
        </div>
      )}
      {analysed.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            <Pill active={view === "general"} onClick={() => setView("general")}>Rapport général</Pill>
            {analysed.map((e) => (
              <Pill key={e.symbol} active={view === e.symbol} onClick={() => setView(e.symbol)}>
                {e.symbol}
              </Pill>
            ))}
          </div>

          {view === "general" || !sel || !selCfg ? (
            <div style={glassCard}>
              <div style={label}>Rapport général — par compte, {general.per.length} paires à {general.per[0]?.e.result!.settings.lots ?? 2} lots</div>
              {general.per[0] && <GeneralRules r={general.per[0].e.result!} account={account} symbols={general.per.map(({ e }) => e.symbol)} />}
              {general.per.length > 0 && <PairRules per={general.per} />}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20, marginTop: 16 }}>
                <Figure
                  title="PnL par mois"
                  value={general.months.length ? fmtUsd(general.pnl / general.span) : "—"}
                  color={tone(general.pnl)}
                  hint={`par compte · ${general.months.filter((m) => general.cell(m, null).pnl > 0).length} / ${general.months.length} mois positifs`}
                />
                {(account.copies ?? 1) > 1 && general.months.length > 0 && (
                  <Figure
                    title={`Sur ${account.copies} comptes`}
                    value={fmtUsd((general.pnl / general.span) * account.copies!)}
                    color={tone(general.pnl)}
                    hint={`réaliste : ${fmtUsd((general.pnl / general.span) * account.copies! * 0.5)} à ${fmtUsd((general.pnl / general.span) * account.copies! * 0.65)}`}
                  />
                )}
                <Figure title="Gagnants" value={pct(general.winRate)} hint={`${(general.trades.length / general.span).toFixed(0)} trades par mois`} />
                <Figure
                  title="Drawdown max"
                  value={fmtUsd(-(general.accountRuns[0]?.run.propDD ?? 0))}
                  color={lossColor}
                  hint={`${DD_MODE_TEXT[account.ddMode ?? "eod"]} · limite ${account.ddLimit ?? "—"} $`}
                />
                <Figure
                  title="Pire journée"
                  value={fmtUsd(general.accountRuns[0]?.run.worstDay ?? 0)}
                  color={lossColor}
                  hint={`limite ${account.dailyStop ?? "—"} $`}
                />
              </div>

              <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 18 }}>
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
                        <td style={{ ...td, fontWeight: 700 }}>
                  {e.symbol}
                  {c.cfg.offset !== 0 && (
                    <div style={{ fontWeight: 400, fontSize: 11 }}>
                      ordre {fmtDist(e.symbol, Math.abs(c.cfg.offset))} {c.cfg.offset < 0 ? "au-delà du" : "avant le"} niveau
                    </div>
                  )}
                </td>
                        <td style={{ ...td, color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl / n)}</td>
                        <td style={td}>{(c.n / n).toFixed(1)}</td>
                        <td style={td}>{pct(c.winRate)}</td>
                        <td style={{ ...td, color: lossColor }}>{fmtUsd(-(c.propDD ?? c.maxDD))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 6 }}>Clique une paire pour voir sa règle.</div>

              <button
                type="button"
                onClick={() => setDetail((o) => !o)}
                style={{ ...mono, fontSize: 12, marginTop: 18, padding: "6px 12px", borderRadius: 5, border: "1px solid oklch(0.34 0.04 250)", background: "transparent", color: "oklch(0.75 0.02 250)", cursor: "pointer" }}
              >
                {detail ? "Masquer le détail" : "Voir le détail"}
              </button>

              {detail && (
              <>
              <div style={{ ...label, fontSize: 11, marginTop: 22 }}>Mois par mois · la règle de chaque paire est sur sa fiche</div>
              <div style={{ overflowX: "auto", marginTop: 8 }}>
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
                          {account.split && (() => {
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
              </>
              )}
            </div>
          ) : (
            <SymbolReport entry={sel} cfg={selCfg} onChoose={(k) => choisir(sel.symbol, k)} />
          )}
        </>
      )}
    </div>
  );
}

/** The way out at two lots, in the words of the desk: one lot here, the other there. */
function exitInLots(c: ConfigStats["cfg"], lots: number): string {
  const k = kindOf(c);
  const trail = `en trailing : à +${c.act} ticks, stop à ${c.dist} ticks du meilleur prix`;
  if (k === "trail") return `les ${lots} lots ${trail}`;
  if (k === "fixed" && c.tp1 === c.tp2) return `les ${lots} lots à +${c.tp1} ticks`;
  const half = lots >= 2 ? `${lots / 2} lot${lots / 2 > 1 ? "s" : ""}` : "½ position";
  if (k === "fixed") return `${half} à +${c.tp1} ticks (stop au BE), ${half} à +${c.tp2} ticks`;
  return `${half} à +${c.tp1} ticks (stop au BE), ${half} ${trail}`;
}

/** What to do on this pair, and nothing else: the rule card. */
function ruleRow(k: string, v: React.ReactNode) {
  return (
    <div key={k} style={{ display: "flex", gap: 12, fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ color: "oklch(0.6 0.03 250)", width: 110, flex: "none" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const ruleBox: React.CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  border: `1px solid ${accentColor}`,
  borderRadius: 8,
  background: "oklch(0.84 0.17 196 / 0.05)",
  display: "grid",
  gap: 6,
};

/** One rule: what to do, in a few words, and the detail under it. */
type Rule = { k: string; main: React.ReactNode; detail?: React.ReactNode };

/** A group of rules on its own card: the moment of the day they belong to. */
function RuleCard({ title, rules }: { title: string; rules: (Rule | null | false | undefined)[] }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, background: "oklch(0.84 0.17 196 / 0.05)", border: "1px solid oklch(0.84 0.17 196 / 0.25)" }}>
      <div style={{ ...label, fontSize: 11, color: accentColor, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 12 }}>
        {rules.filter((x): x is Rule => !!x).map((x) => (
          <div key={x.k}>
            <div style={{ fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "oklch(0.6 0.03 250)", marginBottom: 2 }}>{x.k}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{x.main}</div>
            {x.detail && <div style={{ fontSize: 12, color: "oklch(0.66 0.03 250)", lineHeight: 1.45, marginTop: 2 }}>{x.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What every pair is traded under, read off the reports. */
function GeneralRules({ r, account, symbols }: { r: SymbolResult; account: AccountRules; symbols: string[] }) {
  const bo = r.rules?.blackout;
  const h = r.rules?.hours;
  const lots = r.settings.lots;
  const perDay = r.rules?.maxPerDay ?? 1;
  const positions = account.maxContracts ? Math.floor(account.maxContracts / lots) : null;
  const fill = r.settings.fill;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 8 }}>Règles générales — les mêmes pour toutes les paires</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        <RuleCard
          title="1 · Préparer la séance"
          rules={[
            h && { k: "Horaires", main: `Ordres de ${h[0]}h à ${h[1]}h Chicago`, detail: "sauf les heures exclues indiquées pour la paire" },
            {
              k: "News",
              main: bo ? `Pas d'ordre ${bo.before} min avant → ${bo.after} min après` : "Pas de blackout",
              detail: bo ? (bo.all ? "chaque news 3 étoiles des devises de la paire" : "CPI, NFP, Fed et la banque centrale de la paire") : undefined,
            },
            r.rules?.minApproach
              ? {
                  k: "Approche",
                  main: `Au moins ${fmtDistBySymbol(r.rules.minApproach, symbols)} vers le niveau depuis 17h`,
                  detail: "sinon pas d'ordre sur ce niveau ; un niveau traversé dans la séance ne se trade plus dans l'autre sens",
                }
              : null,
            { k: "Ticks", main: "1 tick = une ligne du DOM", detail: tickNote(symbols, (s) => CONTRACTS[s]?.tickSize).replace(/^1 tick = une ligne du DOM — /, "") },
          ]}
        />
        <RuleCard
          title="2 · Entrer"
          rules={[
            { k: "Sens", main: "Achat si le prix descend sur le niveau, vente s'il monte dessus" },
            {
              k: "Ordre",
              main: `Limite 1 tick avant le niveau · ${lots} lots · SL attaché`,
              detail: "rempli dès que le prix touche le niveau, quelle que soit ta place dans la file (écart propre à la paire s'il est indiqué)",
            },
            {
              k: "Un trade par paire",
              main: `${perDay} trade par jour et par paire`,
              detail: "un ordre par niveau valable ; dès que l'un est rempli, annule les autres de cette paire pour la journée — les autres paires gardent les leurs",
            },
            {
              k: "Nouvelle touche",
              main: `Le prix doit s'éloigner de ${fmtDistBySymbol(r.settings.rearm, symbols)} puis revenir`,
              detail: "avant qu'un niveau déjà touché compte de nouveau",
            },
            {
              k: "Déjà touché hors horaires",
              main: "Pas d'ordre sur un niveau déjà touché la nuit, à une heure exclue ou pendant une news",
              detail: `tant que le prix ne s'en est pas éloigné de ${fmtDistBySymbol(r.settings.rearm, symbols)} : un prix qui traîne sur le niveau depuis des heures ne rebondit plus (backtest : ces trades gagnent 1 fois sur 3 et perdent ≈ 13 500 $ par an)`,
            },
          ]}
        />
        <RuleCard
          title="3 · Gérer le trade"
          rules={[
            { k: "TP1", main: `${lots / 2} lot au TP1, stop au prix d'entrée` },
            { k: "Runner", main: "L'autre lot en trailing dès TP1, à la distance du TP1", detail: "sorti au TP2 de la paire s'il l'atteint" },
            { k: "Durée", main: `${r.settings.maxHours} h au plus en position`, detail: r.rules?.flatAt ? `tout clôturé à ${r.rules.flatAt}h Chicago` : undefined },
          ]}
        />
        <RuleCard
          title="4 · Protéger le compte"
          rules={[
            r.settings.maxLossPerTrade ? { k: "Par trade", main: `Jamais plus de ${r.settings.maxLossPerTrade} $ perdus` } : null,
            account.dailyStop ? { k: "Par jour", main: `−${account.dailyStop} $ : tout fermer, journée finie`, detail: "positions ouvertes comprises" } : null,
            positions ? { k: "En même temps", main: `${positions} positions au plus`, detail: `${account.maxContracts} contrats` } : null,
            account.ddLimit
              ? { k: "Drawdown", main: `${account.ddLimit} $ max`, detail: account.ddMode === "eod" ? "suiveur fin de journée" : "suiveur intraday" }
              : null,
            fill && {
              k: "Backtest",
              main: "Compté prudemment",
              detail: `un ordre n'est compté rempli que si le prix le dépasse de ${fmtDist(r.symbol, fill.through)}${fill.cancelOnMiss ? ", annulé s'il a été touché sans être rempli puis que le prix est allé au TP1" : ""}`,
            },
          ]}
        />
      </div>
    </div>
  );
}

/** Every pair's own settings on one table, for the general report. */
function PairRules({ per }: { per: { e: Entry; c: ConfigStats }[] }) {
  return (
    <div style={{ ...ruleBox, overflowX: "auto" }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 2 }}>Règles par paire</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
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
                  {kindOf(c.cfg) === "tp1trail" && c.cfg.tp2 > c.cfg.tp1 && (
                    <div style={{ color: "oklch(0.62 0.034 250)" }}>TP2 {fmtDist(e.symbol, c.cfg.tp2)}</div>
                  )}
                </td>
                <td style={td}>{hours.length ? hoursText(hours) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  TP1: "TP1, reste au BE",
  TR: "TP1 + trailing",
  TP2: "TP2",
  TO: "Clôturé (durée max)",
};

/** The months, each one opening onto the trades it took: entry, stop, target and result. */
function MonthsWithTrades({ r, cfg, months }: { r: SymbolResult; cfg: ConfigStats; months: string[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const c = cfg.cfg;
  const tick = r.tickSize;
  const money = r.tickValue * r.settings.lots;
  const rows = openMonth ? cfg.trades.filter((t) => monthOf(t[0] * 60000) === openMonth) : [];
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...label, fontSize: 11 }}>Mois par mois · clique sur un mois pour voir ses trades</div>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 520, marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>Mois</th>
            <th style={th}>Trades</th>
            <th style={th}>Win</th>
            <th style={th}>PnL</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const b = cfg.months[m];
            const on = m === openMonth;
            return (
              <tr key={m} onClick={() => setOpenMonth(on ? null : m)} style={{ cursor: "pointer", background: on ? "oklch(0.84 0.17 196 / 0.1)" : undefined }}>
                <td style={{ ...td, fontFamily: "inherit", color: on ? accentColor : undefined }}>{on ? "▾ " : "▸ "}{monthLabel(m)}</td>
                <td style={td}>{b.n}</td>
                <td style={td}>{pct(b.wins / b.n)}</td>
                <td style={{ ...td, color: tone(b.pnl), fontWeight: 700 }}>{fmtUsd(b.pnl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openMonth && (
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <div style={{ ...label, fontSize: 11 }}>Trades de {monthLabel(openMonth)} · heures de Chicago</div>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={th}>Ouvert</th>
                <th style={th}>Sens</th>
                <th style={th}>Niveau</th>
                <th style={th}>Entrée</th>
                <th style={th}>SL</th>
                <th style={th}>TP1</th>
                <th style={th}>Sortie</th>
                <th style={th}>Fermé</th>
                <th style={th}>Ticks</th>
                <th style={th}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const [m, ticks, end, , , , zone, dir, out] = t;
                const known = zone !== undefined && dir !== undefined && tick;
                const entry = known ? zone + dir * c.offset * tick : null;
                const price = (p: number | null) => (p === null ? "—" : fmtPrice(p, r.symbol, tick));
                return (
                  <tr key={m}>
                    <td style={{ ...td, fontFamily: "inherit" }}>{chicagoTime.format(m * 60000)}</td>
                    <td style={{ ...td, fontFamily: "inherit" }}>{dir === undefined ? "—" : dir === 1 ? "Achat" : "Vente"}</td>
                    <td style={td}>{zone === undefined ? "—" : fmtPrice(zone, r.symbol, tick)}</td>
                    <td style={td}>{price(entry)}</td>
                    <td style={td}>{price(entry === null ? null : entry - dir * c.sl * tick!)}</td>
                    <td style={td}>{price(entry === null ? null : entry + dir * c.tp1 * tick!)}</td>
                    <td style={{ ...td, fontFamily: "inherit" }}>{out === undefined ? "—" : OUT_TEXT[OUTCOMES[out]] ?? OUTCOMES[out]}</td>
                    <td style={{ ...td, fontFamily: "inherit" }}>{end === undefined ? "—" : chicagoTime.format(end * 60000).split(" ").pop()}</td>
                    <td style={{ ...td, color: tone(ticks) }}>
                      {ticks > 0 ? "+" : ""}
                      {String(Math.round(ticks * 100) / 100).replace(".", ",")}
                    </td>
                    <td style={{ ...td, color: tone(ticks), fontWeight: 700 }}>{fmtUsd(ticks * money)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)", marginTop: 6 }}>
            Ticks par contrat, en moyenne sur les {r.settings.lots} lots (un à TP1, l&apos;autre en trailing) · PnL à {r.settings.lots} lots
          </div>
        </div>
      )}
    </div>
  );
}

/** What is this pair's own: its levels, stop, TP1 and the hours it skips. */
function Fiche({ r, cfg }: { r: SymbolResult; cfg: ConfigStats }) {
  const c = cfg.cfg;
  const lots = r.settings.lots;
  const levels = Object.entries(cfg.zones).sort(([a], [b]) => Number(a) - Number(b));
  const hours = r.rules?.excludeHours ?? [];
  return (
    <div style={ruleBox}>
      {ruleRow(
        "Niveaux",
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {levels.map(([z, b]) => (
            <span key={z} style={{ ...mono, color: b.pnl > 0 ? undefined : lossColor }} title={`${fmtUsd(b.pnl)} sur ${b.n} trades`}>
              {fmtZone(Number(z), r.symbol)}
              {b.pnl > 0 ? "" : " ✗"}
            </span>
          ))}
        </span>
      )}
      {ruleRow(
        "Lots",
        <span>
          <b>50k : {lots} lots</b>
          {kindOf(c) === "tp1trail" && lots >= 2 ? ` — ${lots / 2} sort à TP1, ${lots / 2 > 1 ? "les autres suivent" : "l'autre suit"} le trailing` : ""}
          {/* Not worked out yet: it takes LMI's drawdown, daily limit and
              contracts for those accounts, which have not been given. */}
          <span style={{ color: "oklch(0.55 0.03 250)" }}> · 100k et 150k : à calculer avec les règles LMI de ces comptes</span>
        </span>
      )}
      {c.offset !== 0 && ruleRow("Entrée", `${fmtDist(r.symbol, Math.abs(c.offset))} ${c.offset > 0 ? "avant le" : "au-delà du"} niveau`)}
      {ruleRow("Stop", `${fmtDist(r.symbol, c.sl)} (${(c.sl * r.tickValue * lots).toFixed(0)} $ à ${lots} lots)`)}
      {ruleRow("TP1", kindOf(c) === "tp1trail" ? `${fmtDist(r.symbol, c.tp1)}, puis trailing à ${fmtDist(r.symbol, c.dist)}` : exitInLots(c, lots))}
      {kindOf(c) === "tp1trail" && c.tp2 > c.tp1 && ruleRow("TP2", `${fmtDist(r.symbol, c.tp2)} pour le 2e lot — loin, là où vont les plus grosses courses : le trailing sort avant la plupart du temps`)}
      {hours.length > 0 && ruleRow("Pas d'ordre", `${hoursText(hours)} (Chicago)`)}
      <LevelPrices r={r} c={c} zones={levels.map(([z]) => Number(z))} />
    </div>
  );
}

/**
 * Every level's order in prices, both ways: entry, stop, TP1, and the price
 * it must go away to before a second bounce on the level is traded.
 */
function LevelPrices({ r, c, zones }: { r: SymbolResult; c: ConfigStats["cfg"]; zones: number[] }) {
  const tick = r.tickSize ?? CONTRACTS[r.symbol]?.tickSize;
  if (!tick) return null;
  const price = (x: number) => fmtPrice(x, r.symbol, tick);
  const rearm = r.settings.rearm;
  const hasTp2 = kindOf(c) === "tp1trail" && c.tp2 > c.tp1;
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 12.5 }}>Prix par niveau : entrée, SL, TP1{hasTp2 ? ", TP2" : ""}, 2e rebond</summary>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Niveau</th>
              <th style={th}>Ordre</th>
              <th style={th}>Entrée</th>
              <th style={th}>SL</th>
              <th style={th}>TP1 (1 lot)</th>
              {hasTp2 && <th style={th}>TP2 (2e lot)</th>}
              <th style={th} title="Après une touche, le niveau ne se retrade que si le prix va jusqu'à ce prix puis revient">
                2e rebond : s&apos;éloigner jusqu&apos;à
              </th>
            </tr>
          </thead>
          <tbody>
            {zones.flatMap((z) =>
              ([1, -1] as const).map((dir) => {
                const entry = z + dir * c.offset * tick;
                return (
                  <tr key={`${z}${dir}`}>
                    <td style={td}>{dir === 1 ? fmtZone(z, r.symbol) : ""}</td>
                    <td style={{ ...td, fontFamily: "inherit", fontWeight: 700, color: dir === 1 ? "oklch(0.78 0.16 150)" : lossColor }}>
                      {dir === 1 ? "Achat (prix qui descend)" : "Vente (prix qui monte)"}
                    </td>
                    <td style={td}>{price(entry)}</td>
                    <td style={td}>{price(entry - dir * c.sl * tick)}</td>
                    <td style={td}>{price(entry + dir * c.tp1 * tick)}</td>
                    {hasTp2 && <td style={td}>{price(entry + dir * c.tp2 * tick)}</td>}
                    <td style={td}>{price(z + dir * rearm * tick)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SymbolReport({ entry, cfg, onChoose }: { entry: Entry; cfg: ConfigStats; onChoose: (key: string) => void }) {
  const r = entry.result!;
  const months = Object.keys(cfg.months).sort().reverse();
  const [open, setOpen] = useState(false);
  const nMonths = spanMonths(r);
  return (
    <div style={glassCard}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={label}>{r.symbol}</div>
        <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)" }}>
          backtest du {fmtDay(r.from)} au {fmtDay(r.to)} · {r.settings.lots} lots
        </div>
      </div>

      <Fiche r={r} cfg={cfg} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 20, marginTop: 18 }}>
        <Figure title="PnL par mois" value={fmtUsd(cfg.pnl / nMonths)} color={tone(cfg.pnl)} hint={`${fmtUsd(cfg.pnl)} sur la période`} />
        <Figure title="Trades par mois" value={(cfg.n / nMonths).toFixed(1)} />
        <Figure title="Gagnants" value={pct(cfg.winRate)} />
        <Figure title="Drawdown max" value={fmtUsd(-(cfg.propDD ?? cfg.maxDD))} color={lossColor} hint="fin de journée" />
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...mono, fontSize: 12, marginTop: 18, padding: "6px 12px", borderRadius: 5, border: "1px solid oklch(0.34 0.04 250)", background: "transparent", color: "oklch(0.75 0.02 250)", cursor: "pointer" }}
      >
        {open ? "Masquer le détail" : "Voir le détail"}
      </button>

      {open && (
      <>
      <div style={{ ...label, fontSize: 11, marginTop: 22 }}>Configs — la tienne, puis les 3 meilleures autres · clique pour en retenir une</div>
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Entrée</th>
              <th style={th}>SL</th>
              <th style={th}>Sortie</th>
              <th style={th}>Trades</th>
              <th style={th}>Win</th>
              <th style={th}>PnL</th>
              <th style={th}>PF</th>
              <th style={th}>DD prop</th>
              <th style={th}>PnL ÷ DD</th>
              <th style={th}>Mois +</th>
            </tr>
          </thead>
          <tbody>
            {r.top.map((c, i) => {
              const ms = Object.values(c.months);
              const on = c.key === cfg.key;
              return (
                <tr key={c.key} onClick={() => onChoose(c.key)} style={{ cursor: "pointer", background: on ? "oklch(0.84 0.17 196 / 0.1)" : undefined }}>
                  <td style={{ ...td, color: on ? accentColor : undefined }}>{on ? "●" : i + 1}</td>
                  <td style={td}>{fmtOffset(c.cfg.offset)}</td>
                  <td style={td}>{c.cfg.sl}</td>
                  <td style={td}>{exitShort(c.cfg)}</td>
                  <td style={td}>{c.n}</td>
                  <td style={td}>{pct(c.winRate)}</td>
                  <td style={{ ...td, color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl)}</td>
                  <td style={td}>{fmtPfOrInf(c.pf)}</td>
                  <td style={{ ...td, color: lossColor }}>{fmtUsd(-(c.propDD ?? c.maxDD))}</td>
                  <td style={td}>{ratioOf(c).toFixed(2)}</td>
                  <td style={td}>{ms.filter((m) => m.pnl > 0).length} / {ms.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MonthsWithTrades r={r} cfg={cfg} months={months} />
      </>
      )}
    </div>
  );
}
