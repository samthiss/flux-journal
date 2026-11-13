"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { Figure, Pill, fieldStyle, fmtOffset, fmtUsd, label, mono, monthLabel, td, th, tone } from "@/components/BacktestUi";
import { ratioOf, kindOf, monthOf, type Bucket, type ConfigStats, type SymbolResult } from "@/lib/databento/engine";
import { DEFAULT_TIERS, fromRow, pairBudget, parseTiers, runAccount, tiersText, type AccountRules } from "@/lib/databento/account";
import { chooseDatabentoConfig } from "@/lib/actions/databento";

type Saved = { symbol: string; zones: number[]; result: string | null; chosenKey: string | null };
type Entry = { symbol: string; zones: number[]; result: SymbolResult | null; chosenKey: string | null };

const SETTINGS_KEY = "databento-settings";

/** The trader's account: MEDIUM at the prop firm, five pairs, a master and a slave to start with. */
const DEFAULT_ACCOUNT: AccountRules = {
  tiers: DEFAULT_TIERS,
  dailyStop: 1000,
  ddLimit: 2000,
  pairs: 5,
  safety: 30,
  ddMode: "eod",
  target: null,
  maxContracts: 5,
  maxLossPerTrade: 500,
  wholeLots: true,
  copies: 2,
};
const DD_MODE_TEXT = { eod: "suiveur fin de journée", intraday: "suiveur intraday" } as const;

/**
 * How many months the history spans, for "a month": not the months a pair
 * happened to trade in, which would make a pair that sat out three of them
 * look a third better than it was.
 */
const spanMonths = (r: { from: number; to: number }) => Math.max(1, (r.to - r.from) / (30.44 * 86400000));

const fmtZone = (z: number) => String(z).replace(".", ",");
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

function BucketTable({ title, first, rows }: { title: string; first: string; rows: [string, Bucket][] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11 }}>{title}</div>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={th}>{first}</th>
            <th style={th}>Trades</th>
            <th style={th}>Win</th>
            <th style={th}>PnL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, b]) => (
            <tr key={k}>
              <td style={{ ...td, fontFamily: "inherit" }}>{k}</td>
              <td style={td}>{b.n}</td>
              <td style={td}>{pct(b.wins / b.n)}</td>
              <td style={{ ...td, color: tone(b.pnl), fontWeight: 700 }}>{fmtUsd(b.pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own storage, read once after mount
        setAccount({ ...DEFAULT_ACCOUNT, ...saved.account });
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
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, account: a }));
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
      return { e, c, money };
    });
    const trades = per
      .flatMap(({ e, c, money }) => c.trades.map(([m, ticks]) => ({ t: m * 60000, pnl: ticks * money, symbol: e.symbol })))
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
    const raw = per.flatMap(({ e, c }) => c.trades.map((row) => fromRow(row, e.result!.tickValue)));
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
          <RuleRow on={!!account.wholeLots} onToggle={(v) => updateAccount({ ...account, wholeLots: v })} label="Lots entiers, pas de micros">
            <span style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)" }}>le plan propose 1, 2 ou 3 lots par paire</span>
          </RuleRow>
          <RuleRow on={!!account.maxLossPerTrade} onToggle={(v) => updateAccount({ ...account, maxLossPerTrade: v ? 500 : null })} label="Perte max par trade, stop touché ($)">
            <input type="number" min={1} value={account.maxLossPerTrade ?? 500} disabled={!account.maxLossPerTrade} onChange={(e) => updateAccount({ ...account, maxLossPerTrade: Number(e.target.value) })} style={{ ...smallField, width: 80 }} />
          </RuleRow>
          <RuleRow on={account.dailyStop !== null} onToggle={(v) => updateAccount({ ...account, dailyStop: v ? 500 : null })} label="Prop firm : perte max par jour, latente comprise ($)">
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
              {general.per[0] && <GeneralRules r={general.per[0].e.result!} />}
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

/** What every pair is traded under, read off the reports. */
function GeneralRules({ r }: { r: SymbolResult }) {
  const bo = r.rules?.blackout;
  const h = r.rules?.hours;
  const lots = r.settings.lots;
  return (
    <div style={ruleBox}>
      <div style={{ ...label, fontSize: 11, marginBottom: 2 }}>Règles générales — les mêmes pour toutes les paires</div>
      {ruleRow("Entrée", `ordre limite sur la zone, ${lots} lots`)}
      {ruleRow("Sortie", `${lots / 2} lot à TP1 (stop au BE), l'autre en trailing dès TP1, à la distance du TP1`)}
      {h && ruleRow("Horaires", `ordres de ${h[0]}h à ${h[1]}h (Chicago) · ${r.rules?.maxPerDay ?? 1} trade par jour et par marché`)}
      {r.rules?.minApproach
        ? ruleRow("Approche", `le prix doit avoir fait au moins ${r.rules.minApproach} ticks vers la zone depuis l'ouverture de 17h (Chicago) — sinon pas d'ordre`)
        : null}
      {ruleRow("Durée", `${r.settings.maxHours} h au plus en position${r.rules?.flatAt ? `, tout clôturé à ${r.rules.flatAt}h` : ""}`)}
      {ruleRow("News", bo ? `pas d'ordre de ${bo.before} min avant à ${bo.after} min après CPI, NFP, Fed et la banque centrale de la paire` : "pas de blackout")}
      {r.settings.maxLossPerTrade ? ruleRow("Risque", `jamais plus de ${r.settings.maxLossPerTrade} $ perdus sur un trade`) : null}
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
            <th style={th}>TP1 = trailing</th>
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
                      {fmtZone(Number(z))}
                      {b.pnl > 0 ? "" : " ✗"}
                    </span>
                  ))}
                </td>
                <td style={td}>
                  {c.cfg.sl} ticks ({(c.cfg.sl * r.tickValue * r.settings.lots).toFixed(0)} $)
                </td>
                <td style={td}>{c.cfg.tp1} ticks</td>
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
              {fmtZone(Number(z))}
              {b.pnl > 0 ? "" : " ✗"}
            </span>
          ))}
        </span>
      )}
      {c.offset !== 0 && ruleRow("Entrée", c.offset > 0 ? `${c.offset} ticks avant le niveau` : `${-c.offset} ticks au-delà du niveau`)}
      {ruleRow("Stop", `${c.sl} ticks (${(c.sl * r.tickValue * lots).toFixed(0)} $ à ${lots} lots)`)}
      {ruleRow("TP1", kindOf(c) === "tp1trail" ? `${c.tp1} ticks, puis trailing à ${c.dist} ticks` : exitInLots(c, lots))}
      {hours.length > 0 && ruleRow("Pas d'ordre", `${hoursText(hours)} (Chicago)`)}
    </div>
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

      <div style={{ maxWidth: 520, marginTop: 22 }}>
        <BucketTable title="Mois par mois" first="Mois" rows={months.map((m) => [monthLabel(m), cfg.months[m]])} />
      </div>
      </>
      )}
    </div>
  );
}
