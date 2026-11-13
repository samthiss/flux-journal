"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, glassCard, lossColor, winColor } from "@/lib/theme";
import { CONTRACTS, newsCurrencies } from "@/lib/contracts";
import { Field, Figure, Pill, fieldStyle, fmtOffset, fmtUsd, label, mono, monthLabel, td, th, tone } from "@/components/BacktestUi";
import { parseDatabentoCsv, mergeDatasets, type Dataset } from "@/lib/databento/parse";
import { deleteDataset, loadDataset, loadDatasets, saveDataset } from "@/lib/databento/store";
import { DEFAULT_RULES, ratioOf, EXIT_LABELS, NEWS_BUCKETS, NEWS_LABELS, type NewsMode, type Rules, analyse, configsOf, kindOf, monthOf, type Best, type Bucket, type ConfigStats, type ExitKind, type Grid, type Settings, type SymbolResult } from "@/lib/databento/engine";
import { DEFAULT_TIERS, bestPlan, fromRow, pairBudget, parseTiers, runAccount, tiersText, type AccountRules, type Plan } from "@/lib/databento/account";
import { entryText, exitText, newsRule, recommend, sizeFor, type Reco } from "@/lib/databento/recommend";
import { chooseDatabentoConfig, deleteDatabentoSymbol, getNewsHistory, saveDatabentoResult, saveDatabentoZones } from "@/lib/actions/databento";

type Saved = { symbol: string; zones: number[]; result: string | null; chosenKey: string | null };
type Entry = { symbol: string; zones: number[]; result: SymbolResult | null; chosenKey: string | null };

const SETTINGS_KEY = "databento-settings";

const DEFAULT_GRID: Grid = {
  offsets: [-4, -2, 0, 2, 4],
  sls: [6, 8, 10, 12, 15, 20],
  tp1s: [5, 10, 15, 20],
  tp2s: [10, 20, 30, 40],
  acts: [10, 15, 20, 30],
  dists: [5, 10, 15, 20],
  kinds: ["fixed", "trail", "tp1trail"],
  newsModes: ["all", "window", "day"],
};
type ListKey = "offsets" | "sls" | "tp1s" | "tp2s" | "acts" | "dists";
const LIST_KEYS: ListKey[] = ["offsets", "sls", "tp1s", "tp2s", "acts", "dists"];
const textOf = (g: Grid) => Object.fromEntries(LIST_KEYS.map((k) => [k, fmtList(g[k])])) as Record<ListKey, string>;
const DEFAULT_SETTINGS: Settings = { lots: 2, rearm: 30, maxHours: 24, minTrades: 10, newsWindow: 30, rules: DEFAULT_RULES, objective: "ratio" };
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
};
const DD_MODE_TEXT = { eod: "suiveur fin de journée", intraday: "suiveur intraday" } as const;

/** "1,3186 / 1,3552" → [1.3186, 1.3552]: a comma is a decimal point here, never a separator. */
function parseZones(text: string): number[] {
  return text
    .split(/[\s/;|]+/)
    .map((x) => Number(x.replace(",", ".")))
    .filter((x) => Number.isFinite(x) && x > 0);
}
const parseList = (text: string) =>
  text
    .split(/[\s,;/]+/)
    .map((x) => Number(x.replace("−", "-")))
    .filter((x) => Number.isFinite(x));
const fmtList = (xs: number[]) => xs.join(", ");
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
const NEWS_SHORT: Record<NewsMode, string> = { all: "", window: " · hors news", day: " · hors jours de news" };
const cfgText = (c: ConfigStats["cfg"]) => `Entrée ${fmtOffset(c.offset)} · SL ${c.sl} · ${exitShort(c)}${NEWS_SHORT[c.news ?? "all"]}`;

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

function btn(color: string, filled = false): React.CSSProperties {
  return {
    ...mono,
    fontSize: 12.5,
    fontWeight: 700,
    padding: "8px 14px",
    borderRadius: 6,
    cursor: "pointer",
    border: `1px solid ${color}`,
    background: filled ? "oklch(0.84 0.17 196 / 0.14)" : "transparent",
    color,
  };
}

/** Cumulative PnL as a line, from a list of trades in order. */
function Equity({ trades, money }: { trades: number[][]; money: number }) {
  if (trades.length < 2) return null;
  const pts: number[] = [0];
  for (const [, ticks] of trades) pts.push(pts[pts.length - 1] + ticks * money);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const W = 600;
  const H = 120;
  const y = (v: number) => (max === min ? H / 2 : H - ((v - min) / (max - min)) * (H - 8) - 4);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, marginTop: 14 }} preserveAspectRatio="none">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="oklch(0.4 0.02 250)" strokeDasharray="4 4" strokeWidth={1} />
      <path d={d} fill="none" stroke={tone(pts[pts.length - 1])} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The most the analysed pairs could have made inside their share of the drawdown. */
function PlanCard({ plan, per, budget }: { plan: Plan | null; per: { e: Entry }[]; budget: number }) {
  const total = budget * per.length;
  return (
    <div style={{ marginTop: 18, padding: "14px 16px", border: `1px solid ${accentColor}`, borderRadius: 8, background: "oklch(0.84 0.17 196 / 0.05)" }}>
      <div style={{ ...label, fontSize: 11 }}>
        Plan prop firm — {per.length} paire(s) analysée(s) × {budget.toFixed(0)} $ = {total.toFixed(0)} $ de drawdown autorisé
      </div>
      {!plan ? (
        <div style={{ fontSize: 13, color: lossColor, marginTop: 8 }}>
          Aucune combinaison ne tient dans ce budget, même en micros : ces configs sont trop risquées pour ton compte.
        </div>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={th}>Paire</th>
                <th style={th}>Config</th>
                <th style={th}>Taille</th>
              </tr>
            </thead>
            <tbody>
              {plan.choices.map((c) => {
                const cfg = per.find((p) => p.e.symbol === c.symbol)?.e.result?.top.find((x) => x.key === c.key)?.cfg;
                return (
                  <tr key={c.symbol}>
                    <td style={{ ...td, fontWeight: 700 }}>{c.symbol}</td>
                    <td style={td}>{cfg ? cfgText(cfg) : <span style={{ color: lossColor }}>ne pas trader</span>}</td>
                    <td style={td}>{c.key ? (c.lots >= 1 ? `${c.lots} lot(s)` : `${Math.round(c.lots * 10)} micros`) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap", ...mono, fontSize: 12.5 }}>
            <span>
              PnL <b style={{ color: tone(plan.run.pnl) }}>{fmtUsd(plan.run.pnl)}</b>
            </span>
            <span>
              DD prop <b style={{ color: lossColor }}>{fmtUsd(-plan.run.propDD)}</b> / {total.toFixed(0)} $
            </span>
            <span>{plan.run.n} trades · {pct(plan.run.winRate)}</span>
            <span>
              pire journée <b style={{ color: lossColor }}>{fmtUsd(plan.run.worstDay)}</b>
            </span>
            <span>{plan.run.maxOpen} contrats ouverts au plus</span>
            {plan.run.targetAt && <span style={{ color: accentColor }}>objectif atteint le {fmtDay(plan.run.targetAt)} ({plan.run.targetSessions} séances)</span>}
            <span style={{ color: "oklch(0.55 0.03 250)" }}>{plan.searched.toLocaleString("fr-FR")} combinaisons testées</span>
          </div>
        </>
      )}
    </div>
  );
}

/** What the account rules did, from the runs the general report already made. */
function accountRecos(runs: { label: string; run: ReturnType<typeof runAccount> }[], account: AccountRules, lots: number): Reco[] {
  const out: Reco[] = [];
  const base = runs[0]?.run;
  if (!base) return out;
  const usd = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)} $`;
  if (account.tiers) {
    const t = runs.find((r) => r.label.startsWith("Paliers ") && !r.label.includes("limite jour"))?.run;
    if (t)
      out.push({
        tone: "ok",
        text: `Paliers : ${usd(t.pnl)} (DD ${usd(-t.propDD)}) contre ${usd(base.pnl)} (DD ${usd(-base.propDD)}) à ${lots} lots fixes. Dernier palier atteint : ${t.lastLots} lot(s).`,
      });
  }
  if (account.dailyStop !== null) {
    const d = runs.find((r) => r.label.includes("limite jour") && !r.label.startsWith("Paliers"))?.run;
    if (d && d.stopDays === 0)
      out.push({ tone: "ok", text: `Limite de −${account.dailyStop} $ par jour (latente comprise) : jamais touchée sur la période.` });
    else if (d)
      out.push({
        tone: d.pnl >= base.pnl ? "ok" : "warn",
        text: `Limite de −${account.dailyStop} $ par jour (latente comprise) : touchée ${d.stopDays} jour(s), positions coupées par la prop firm et ${d.skipped} trade(s) non pris ensuite — ${usd(d.pnl - base.pnl)} sur le résultat.`,
      });
  }
  return out;
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

function Recommendations({ recos, title = "Recommandations" }: { recos: Reco[]; title?: string }) {
  if (!recos.length) return null;
  const mark = { rule: "▶", ok: "✓", warn: "!" } as const;
  const color = { rule: accentColor, ok: winColor, warn: lossColor } as const;
  return (
    <div style={{ marginTop: 20, padding: "14px 16px", border: "1px solid oklch(0.84 0.17 196 / 0.25)", borderRadius: 8, background: "oklch(0.84 0.17 196 / 0.04)" }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 7 }}>
        {recos.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.5, fontWeight: r.tone === "rule" ? 600 : undefined }}>
            <span style={{ ...mono, color: color[r.tone], width: 12, flex: "none" }}>{mark[r.tone]}</span>
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BestTable({ title, rows, render }: { title: string; rows: Best[]; render: (v: string) => string }) {
  // The row the ranking prefers: per dollar of drawdown when the result has it.
  const score = (b: Best) => b.ratio ?? b.pnl;
  const top = rows.reduce<Best | null>((a, b) => (!a || score(b) > score(a) ? b : a), null);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>{title}</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}></th>
            <th style={th}>Trades</th>
            <th style={th}>Win</th>
            <th style={th}>PnL</th>
            <th style={th}>÷ DD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value} style={{ background: top?.value === r.value ? "oklch(0.84 0.17 196 / 0.08)" : undefined }}>
              <td style={{ ...td, color: top?.value === r.value ? accentColor : undefined }}>
                {render(r.value)}
                {top?.value === r.value ? " ★" : ""}
              </td>
              <td style={td}>{r.n}</td>
              <td style={td}>{pct(r.winRate)}</td>
              <td style={{ ...td, color: tone(r.pnl), fontWeight: 700 }}>{fmtUsd(r.pnl)}</td>
              <td style={td}>{r.ratio !== undefined ? r.ratio.toFixed(1) : "—"}</td>
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
  const [datasets, setDatasets] = useState<Omit<Dataset, "t" | "o" | "h" | "l" | "c">[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [fallbackSymbol, setFallbackSymbol] = useState("");
  const [zoneDrafts, setZoneDrafts] = useState<Record<string, string>>({});
  const [newSymbol, setNewSymbol] = useState("");

  // ---- Settings, kept in the browser ---------------------------------------
  const [grid, setGrid] = useState<Grid>(DEFAULT_GRID);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [gridText, setGridText] = useState<Record<ListKey, string>>(() => textOf(DEFAULT_GRID));
  const [account, setAccount] = useState<AccountRules>(DEFAULT_ACCOUNT);
  const [tiersDraft, setTiersDraft] = useState(tiersText(DEFAULT_TIERS));
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (saved?.grid && saved?.settings) {
        // Settings saved before the trailing stop existed lack its lists.
        const g: Grid = { ...DEFAULT_GRID, ...saved.grid };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own storage, read once after mount
        setGrid(g);
        // Settings saved before the rules existed start on the trader's own.
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings, rules: saved.settings.rules ?? DEFAULT_RULES });
        setGridText(textOf(g));
        if (saved.account) {
          setAccount({ ...DEFAULT_ACCOUNT, ...saved.account });
          setTiersDraft(tiersText(saved.account.tiers ?? DEFAULT_TIERS));
        }
      }
    } catch {
      // ignore storage failures
    }
    loadDatasets()
      .then((ds) => setDatasets(ds.map((d) => ({ symbol: d.symbol, from: d.from, to: d.to, n: d.n, importedAt: d.importedAt }))))
      .catch(() => setMessage({ text: "Le stockage local du navigateur n'est pas disponible.", error: true }));
  }, []);
  const saveSettings = (g: Grid, s: Settings, a: AccountRules = account) => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ grid: g, settings: s, account: a }));
    } catch {
      // ignore storage failures
    }
  };
  const toggleNews = (m: NewsMode) => {
    const cur = grid.newsModes ?? ["all"];
    const g = { ...grid, newsModes: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] };
    setGrid(g);
    saveSettings(g, settings);
  };
  const toggleKind = (k: ExitKind) => {
    const kinds = grid.kinds.includes(k) ? grid.kinds.filter((x) => x !== k) : [...grid.kinds, k];
    const g = { ...grid, kinds };
    setGrid(g);
    saveSettings(g, settings);
  };
  const setGridField = (k: ListKey, text: string) => {
    setGridText((t) => ({ ...t, [k]: text }));
    const g = { ...grid, [k]: parseList(text) };
    setGrid(g);
    saveSettings(g, settings);
  };
  const setSetting = (k: keyof Settings, v: number) => {
    const s = { ...settings, [k]: v };
    setSettings(s);
    saveSettings(grid, s);
  };
  const rules = settings.rules ?? DEFAULT_RULES;
  const setRules = (r: Rules) => {
    const s = { ...settings, rules: r };
    setSettings(s);
    saveSettings(grid, s);
  };
  const updateAccount = (a: AccountRules) => {
    setAccount(a);
    saveSettings(grid, settings, a);
  };
  const nConfigs = useMemo(() => configsOf(grid).length * Math.max(1, grid.newsModes?.length ?? 1), [grid]);

  // ---- Symbols: those with data, those with levels, those with results --------
  const symbols = useMemo(
    () => [...new Set([...datasets.map((d) => d.symbol), ...entries.map((e) => e.symbol)])].sort(),
    [datasets, entries]
  );
  const entryOf = (s: string): Entry => entries.find((e) => e.symbol === s) ?? { symbol: s, zones: [], result: null, chosenKey: null };
  const patch = (s: string, p: Partial<Entry>) =>
    setEntries((es) => (es.some((e) => e.symbol === s) ? es.map((e) => (e.symbol === s ? { ...e, ...p } : e)) : [...es, { ...entryOf(s), ...p }]));

  // ---- Import -----------------------------------------------------------------
  const importer = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    const lus: string[] = [];
    try {
      // Every file is read before anything is merged: a year of daily trade
      // files is three hundred of them, and merging after each would copy the
      // growing history three hundred times.
      const list = Array.from(files)
        .filter((f) => /\.(csv|txt)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      const ignored = Array.from(files).filter((f) => !list.includes(f));
      if (!list.length) {
        const zst = ignored.some((f) => /\.(zst|zstd)$/i.test(f.name));
        throw new Error(
          zst
            ? "Ces fichiers sont compressés (.zst). Retélécharge-les sur Databento avec « Compression : None »."
            : "Aucun fichier CSV dans la sélection."
        );
      }
      const parts = new Map<string, Dataset[]>();
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setProgress(`Lecture ${i + 1} / ${list.length} : ${file.name}`);
        await new Promise((r) => setTimeout(r, 0));
        let parsed: Dataset[];
        try {
          parsed = parseDatabentoCsv(await file.text(), fallbackSymbol.trim().toUpperCase() || null);
        } catch (e) {
          throw new Error(`${file.name} : ${e instanceof Error ? e.message : "illisible"}`);
        }
        for (const d of parsed) if (d.n) parts.set(d.symbol, [...(parts.get(d.symbol) ?? []), d]);
      }
      if (!parts.size) throw new Error("Aucune bougie lue dans ces fichiers.");
      for (const [symbol, ds] of parts) {
        setProgress(`${symbol} : assemblage de ${ds.length} fichier(s)…`);
        await new Promise((r) => setTimeout(r, 0));
        const old = await loadDataset(symbol);
        const merged = mergeDatasets(old ? [old, ...ds] : ds);
        await saveDataset(merged);
        lus.push(`${symbol} : ${merged.n.toLocaleString("fr-FR")} bougies (${fmtDay(merged.from)} → ${fmtDay(merged.to)})`);
      }
      if (ignored.length) lus.push(`${ignored.length} fichier(s) non CSV ignoré(s)`);
      const ds = await loadDatasets();
      setDatasets(ds.map((d) => ({ symbol: d.symbol, from: d.from, to: d.to, n: d.n, importedAt: d.importedAt })));
      setMessage({ text: `Importé — ${lus.join(" · ")}` });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Import impossible.", error: true });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const oublierDonnees = async (s: string) => {
    if (!confirm(`Supprimer les bougies de ${s} de ce navigateur ? Les niveaux et le dernier rapport restent.`)) return;
    await deleteDataset(s);
    setDatasets((ds) => ds.filter((d) => d.symbol !== s));
  };
  const oublierSymbole = (s: string) => {
    if (!confirm(`Supprimer ${s} : ses niveaux, son rapport, et ses bougies dans ce navigateur ?`)) return;
    startTransition(async () => {
      await deleteDatabentoSymbol(s);
      await deleteDataset(s).catch(() => {});
      setDatasets((ds) => ds.filter((d) => d.symbol !== s));
      setEntries((es) => es.filter((e) => e.symbol !== s));
    });
  };

  // ---- Levels -----------------------------------------------------------------
  const enregistrerZones = (s: string) => {
    const text = zoneDrafts[s] ?? entryOf(s).zones.map(fmtZone).join(" / ");
    startTransition(async () => {
      try {
        const kept = await saveDatabentoZones(s, parseZones(text));
        patch(s, { zones: kept });
        setZoneDrafts((d) => ({ ...d, [s]: kept.map(fmtZone).join(" / ") }));
        setMessage({ text: `${s} : ${kept.length} niveau(x) enregistré(s).` });
      } catch (e) {
        setMessage({ text: e instanceof Error ? e.message : "Enregistrement impossible.", error: true });
      }
    });
  };

  // ---- Analysis -----------------------------------------------------------------
  const lancer = async () => {
    const prets = symbols.filter((s) => datasets.some((d) => d.symbol === s) && entryOf(s).zones.length);
    if (!prets.length) {
      setMessage({ text: "Il faut au moins un symbole avec des bougies importées et des niveaux enregistrés.", error: true });
      return;
    }
    if (settings.rearm <= Math.max(...grid.offsets, 0)) {
      setMessage({ text: "La distance de réarmement doit dépasser le plus grand décalage d'entrée.", error: true });
      return;
    }
    if (!nConfigs) {
      setMessage({ text: "Aucune configuration à tester : coche au moins une sortie et vérifie les listes (TP2 ≥ TP1, distance ≤ déclenchement).", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      for (const s of prets) {
        const spec = CONTRACTS[s];
        if (!spec) throw new Error(`${s} : taille et valeur du tick inconnues.`);
        const d = await loadDataset(s);
        if (!d) continue;
        // The releases the contract moves on, over the same stretch.
        const currencies = newsCurrencies(s);
        let news: { events: Awaited<ReturnType<typeof getNewsHistory>> & object; currencies: string[] } | null = null;
        {
          setProgress(`${s} : lecture du calendrier ${currencies.join("/")}…`);
          const events = await getNewsHistory(currencies, d.from, d.to).catch(() => null);
          news = events ? { events, currencies } : null;
        }
        const r = await analyse(
          s,
          d,
          entryOf(s).zones,
          spec.tickSize,
          spec.tickValue,
          grid,
          { ...settings, ddLimit: pairBudget(account), ddMode: account.ddMode ?? "eod", maxLossPerTrade: account.maxLossPerTrade ?? null },
          (done, total) => setProgress(`${s} : ${done} / ${total} configurations`),
          news
        );
        setProgress(`${s} : enregistrement du rapport…`);
        await saveDatabentoResult(s, JSON.stringify(r));
        patch(s, { result: r, chosenKey: null });
      }
      setMessage({ text: `Analyse terminée : ${prets.join(", ")}.` });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Analyse impossible.", error: true });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const choisir = (s: string, key: string) => {
    const best = entryOf(s).result?.top[0]?.key;
    const k = key === best ? null : key;
    patch(s, { chosenKey: k });
    startTransition(() => chooseDatabentoConfig(s, k));
  };

  // ---- Reports ------------------------------------------------------------------
  const analysed = entries.filter((e) => retained(e)).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const [view, setView] = useState<string>("general");

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
    // The plan: one configuration and one size per pair, inside the share of
    // the drawdown that the analysed pairs are owed.
    const budget = pairBudget(account);
    let plan: Plan | null = null;
    if (budget && per.length)
      plan = bestPlan(
        per.map(({ e }) => ({
          symbol: e.symbol,
          tickValue: e.result!.tickValue,
          configs: e.result!.top.map((c) => ({ key: c.key, trades: c.trades.map((row) => fromRow(row, e.result!.tickValue)) })),
        })),
        budget * per.length,
        account
      );
    return { per, trades, pnl: eq, maxDD, pf: loss > 0 ? win / loss : win > 0 ? null : 0, winRate: trades.length ? wins / trades.length : 0, months, cell, accountRuns, plan, budget };
  }, [analysed, account]);

  const sel = analysed.find((e) => e.symbol === view) ?? null;
  const selCfg = sel ? retained(sel) : null;

  return (
    <div>
      {/* ---- 1. Import ---- */}
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>1 · Données Databento</div>
        <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8, lineHeight: 1.7 }}>
          Sur databento.com : dataset <b>CME Globex MDP 3.0</b>, schéma <b>OHLCV-1m</b>, symbole continu <b>6E.c.0</b> (ou 6E.FUT),
          encodage <b>CSV</b>, compression <b>None</b>. Le fichier est lu par ton navigateur et reste sur ton ordi : rien n&apos;est envoyé.
          Bougies (OHLCV-1m) ou trades : les trades sont transformés en bougies 1 min. Tu peux sélectionner tous les fichiers
          journaliers d&apos;un coup ; un nouvel import du même symbole complète le précédent.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
          <Field title="Fichiers CSV">
            <input type="file" accept=".csv,text/csv,.json" multiple disabled={busy} onChange={(e) => { void importer(e.target.files); e.target.value = ""; }} style={{ ...fieldStyle, width: 320 }} />
          </Field>
          <Field title="Symbole" hint="seulement si le fichier n'a pas de colonne symbol">
            <input value={fallbackSymbol} onChange={(e) => setFallbackSymbol(e.target.value)} placeholder="ex. 6E" style={{ ...fieldStyle, width: 120 }} />
          </Field>
        </div>
        {datasets.length > 0 && (
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 16 }}>
            <thead>
              <tr>
                <th style={th}>Symbole</th>
                <th style={th}>Période</th>
                <th style={th}>Bougies 1 min</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.symbol}>
                  <td style={td}>{d.symbol}{!CONTRACTS[d.symbol] && <span style={{ color: lossColor }}> · tick inconnu</span>}</td>
                  <td style={td}>{fmtDay(d.from)} → {fmtDay(d.to)}</td>
                  <td style={td}>{d.n.toLocaleString("fr-FR")}</td>
                  <td style={td}>
                    <button type="button" onClick={() => oublierDonnees(d.symbol)} style={{ ...btn(lossColor), padding: "3px 8px", fontSize: 11 }}>
                      Supprimer les bougies
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- 2. Levels ---- */}
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>2 · Niveaux de trade</div>
        <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8 }}>
          Un ou plusieurs niveaux par symbole, séparés par « / ». Prix qui descend sur le niveau → long, prix qui monte → short.
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {symbols.map((s) => {
            const e = entryOf(s);
            const hasData = datasets.some((d) => d.symbol === s);
            return (
              <div key={s} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 13, minWidth: 54, fontWeight: 700 }}>{s}</span>
                <input
                  value={zoneDrafts[s] ?? e.zones.map(fmtZone).join(" / ")}
                  onChange={(ev) => setZoneDrafts((d) => ({ ...d, [s]: ev.target.value }))}
                  placeholder="ex. 1,3186 / 1,3552"
                  style={{ ...fieldStyle, width: 320 }}
                />
                <button type="button" disabled={pending} onClick={() => enregistrerZones(s)} style={btn(accentColor)}>
                  Enregistrer
                </button>
                {!hasData && <span style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)" }}>pas de bougies dans ce navigateur</span>}
                <button type="button" disabled={pending} onClick={() => oublierSymbole(s)} title={`Supprimer ${s}`} style={{ marginLeft: "auto", border: "none", background: "transparent", color: lossColor, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Ajouter un symbole (ex. 6B)" style={{ ...fieldStyle, width: 220 }} />
            <button
              type="button"
              onClick={() => {
                const s = newSymbol.trim().toUpperCase();
                if (s && !symbols.includes(s)) patch(s, {});
                setNewSymbol("");
              }}
              style={btn("oklch(0.75 0.02 250)")}
            >
              Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* ---- Rules ---- */}
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>Tes règles</div>
        <div style={{ fontSize: 12.5, color: "oklch(0.62 0.03 250)", marginTop: 8 }}>
          Appliquées à toutes les configs testées, heures de Chicago. Le rapport montre ce que chacune rapporte ou coûte en la retirant.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginTop: 14, fontSize: 13 }}>
          <RuleRow on={rules.maxPerDay !== null} onToggle={(v) => setRules({ ...rules, maxPerDay: v ? 1 : null })} label="Trades max par jour et par marché">
            <input type="number" min={1} value={rules.maxPerDay ?? 1} disabled={rules.maxPerDay === null} onChange={(e) => setRules({ ...rules, maxPerDay: Math.max(1, Number(e.target.value)) })} style={smallField} />
          </RuleRow>
          <RuleRow on={rules.hours !== null} onToggle={(v) => setRules({ ...rules, hours: v ? [1, 15] : null })} label="Ordres actifs de / à (h)">
            <input type="number" min={0} max={23} value={rules.hours?.[0] ?? 1} disabled={!rules.hours} onChange={(e) => setRules({ ...rules, hours: [Number(e.target.value), rules.hours?.[1] ?? 15] })} style={smallField} />
            <input type="number" min={1} max={24} value={rules.hours?.[1] ?? 15} disabled={!rules.hours} onChange={(e) => setRules({ ...rules, hours: [rules.hours?.[0] ?? 1, Number(e.target.value)] })} style={smallField} />
          </RuleRow>
          <RuleRow on={rules.flatAt !== null} onToggle={(v) => setRules({ ...rules, flatAt: v ? 16 : null })} label="Clôture de tout à (h)">
            <input type="number" min={0} max={23} value={rules.flatAt ?? 16} disabled={rules.flatAt === null} onChange={(e) => setRules({ ...rules, flatAt: Number(e.target.value) })} style={smallField} />
          </RuleRow>
          <RuleRow
            on={rules.blackout !== null}
            onToggle={(v) => setRules({ ...rules, blackout: v ? { before: 30, after: 120 } : null })}
            label="Blackout CPI/NFP/Fed + BoE ou BCE (min avant / après)"
          >
            <input type="number" min={0} value={rules.blackout?.before ?? 30} disabled={!rules.blackout} onChange={(e) => setRules({ ...rules, blackout: { before: Number(e.target.value), after: rules.blackout?.after ?? 120 } })} style={smallField} />
            <input type="number" min={0} value={rules.blackout?.after ?? 120} disabled={!rules.blackout} onChange={(e) => setRules({ ...rules, blackout: { before: rules.blackout?.before ?? 30, after: Number(e.target.value) } })} style={smallField} />
          </RuleRow>
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
          <RuleRow on onToggle={() => {}} label="Objectif">
            <select
              value={settings.objective ?? "ratio"}
              onChange={(e) => {
                const s = { ...settings, objective: e.target.value as Settings["objective"] };
                setSettings(s);
                saveSettings(grid, s);
              }}
              style={{ ...smallField, width: 230 }}
            >
              <option value="ratio">Risque minimal (PnL ÷ drawdown)</option>
              <option value="pnl">PnL max sous le budget</option>
            </select>
          </RuleRow>
          <RuleRow on={!!account.maxLossPerTrade} onToggle={(v) => updateAccount({ ...account, maxLossPerTrade: v ? 500 : null })} label="Perte max par trade, stop touché ($)">
            <input type="number" min={1} value={account.maxLossPerTrade ?? 500} disabled={!account.maxLossPerTrade} onChange={(e) => updateAccount({ ...account, maxLossPerTrade: Number(e.target.value) })} style={{ ...smallField, width: 80 }} />
          </RuleRow>
          <RuleRow on={account.dailyStop !== null} onToggle={(v) => updateAccount({ ...account, dailyStop: v ? 500 : null })} label="Prop firm : perte max par jour, latente comprise ($)">
            <input type="number" min={1} value={account.dailyStop ?? 500} disabled={account.dailyStop === null} onChange={(e) => updateAccount({ ...account, dailyStop: Number(e.target.value) })} style={smallField} />
          </RuleRow>
        </div>
        <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 10 }}>
          Paliers, limite par jour et drawdown du compte sont des règles de compte : elles s&apos;appliquent dans le rapport général, sur les trades de tous les symboles
          ensemble, sans relancer l&apos;analyse.
        </div>
      </div>

      {/* ---- 3. Settings and run ---- */}
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>3 · Ce qui est testé</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 16, marginTop: 14 }}>
          <Field title="Entrée (ticks)" hint="+ avant le niveau, − au-delà">
            <input value={gridText.offsets} onChange={(e) => setGridField("offsets", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="SL (ticks)">
            <input value={gridText.sls} onChange={(e) => setGridField("sls", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="TP1 (ticks)" hint="½ position, SL → BE">
            <input value={gridText.tp1s} onChange={(e) => setGridField("tp1s", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="TP2 (ticks)" hint="TP2 = TP1 : TP unique">
            <input value={gridText.tp2s} onChange={(e) => setGridField("tp2s", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="Trailing : déclenchement" hint="ticks de gain avant que le stop suive">
            <input value={gridText.acts} onChange={(e) => setGridField("acts", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="Trailing : distance" hint="ticks entre le stop et le meilleur prix">
            <input value={gridText.dists} onChange={(e) => setGridField("dists", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="Lots">
            <input type="number" min={1} value={settings.lots} onChange={(e) => setSetting("lots", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Réarmement (ticks)" hint="distance pour qu'un retour compte comme nouvelle touche">
            <input type="number" min={1} value={settings.rearm} onChange={(e) => setSetting("rearm", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Durée max (heures)" hint="sinon sortie au prix du moment">
            <input type="number" min={1} value={settings.maxHours} onChange={(e) => setSetting("maxHours", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Fenêtre news (min)" hint="avant et après une annonce à fort impact">
            <input type="number" min={1} value={settings.newsWindow ?? 30} onChange={(e) => setSetting("newsWindow", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Trades minimum" hint="pour qu'une config soit classée">
            <input type="number" min={1} value={settings.minTrades} onChange={(e) => setSetting("minTrades", Number(e.target.value))} style={fieldStyle} />
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={lancer} style={{ ...btn(accentColor, true), padding: "10px 18px", fontSize: 13.5, cursor: busy ? "wait" : "pointer" }}>
            Lancer l&apos;analyse
          </button>
          <span style={{ display: "flex", gap: 12, fontSize: 12.5 }}>
            {(Object.keys(EXIT_LABELS) as ExitKind[]).map((k) => (
              <label key={k} style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={grid.kinds.includes(k)} onChange={() => toggleKind(k)} />
                {EXIT_LABELS[k]}
              </label>
            ))}
          </span>
          <span style={{ display: "flex", gap: 12, fontSize: 12.5 }}>
            {(Object.keys(NEWS_LABELS) as NewsMode[]).map((m) => (
              <label key={m} style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={(grid.newsModes ?? ["all"]).includes(m)} onChange={() => toggleNews(m)} />
                {NEWS_LABELS[m]}
              </label>
            ))}
          </span>
          <span style={{ ...mono, fontSize: 12, color: "oklch(0.6 0.03 250)" }}>{nConfigs} configurations par symbole</span>
          {progress && <span style={{ ...mono, fontSize: 12, color: accentColor }}>{progress}</span>}
        </div>
        {message && (
          <div style={{ fontSize: 12.5, marginTop: 12, color: message.error ? lossColor : "oklch(0.8 0.05 196)" }}>{message.text}</div>
        )}
        <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 12, lineHeight: 1.6 }}>
          Simulation en bougies 1 minute : si le SL et un TP tombent dans la même bougie, c&apos;est compté SL ; la bougie qui remplit l&apos;ordre
          peut toucher le SL mais pas un TP. Résultats bruts, sans commissions. La meilleure config sur le passé n&apos;est pas une garantie :
          regarde le nombre de trades et la régularité mois par mois.
        </div>
      </div>

      {/* ---- Reports ---- */}
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
              <div style={label}>Rapport général — config retenue de chaque symbole</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 20, marginTop: 16 }}>
                <Figure title="PnL total" value={fmtUsd(general.pnl)} color={tone(general.pnl)} hint={`${general.trades.length} trades`} />
                <Figure title="Winrate" value={pct(general.winRate)} hint="trades gagnants" />
                <Figure title="Profit factor" value={fmtPfOrInf(general.pf)} />
                <Figure
                  title={`DD ${DD_MODE_TEXT[account.ddMode ?? "eod"]}`}
                  value={fmtUsd(-(general.accountRuns[0]?.run.propDD ?? 0))}
                  color={lossColor}
                  hint={`clôturé : ${fmtUsd(-general.maxDD)}${general.budget ? ` · budget ${(general.budget * general.per.length).toFixed(0)} $` : ""}`}
                />
                <Figure
                  title="Par mois"
                  value={general.months.length ? fmtUsd(general.pnl / general.months.length) : "—"}
                  hint={`${general.months.filter((m) => general.cell(m, null).pnl > 0).length} / ${general.months.length} mois positifs`}
                />
              </div>
              <Equity trades={general.trades.map((t) => [0, t.pnl])} money={1} />
              <Recommendations
                title="Règles par symbole"
                recos={general.per.flatMap(({ e, c }): Reco[] => {
                  const v = e.result!.validation;
                  const nr = newsRule(c.cfg.news, e.result!);
                  const lines: Reco[] = [
                    { tone: "rule", text: `${e.symbol} : ${entryText(c.cfg.offset)}, SL ${c.cfg.sl} ticks, ${exitText(c.cfg)}.${nr ? ` ${nr}` : ""}` },
                  ];
                  if (c.pnl <= 0) lines.push({ tone: "warn", text: `${e.symbol} perd avec sa meilleure config (${fmtUsd(c.pnl)}) : à ne pas trader sur ces niveaux.` });
                  else if (v && v.outPnl <= 0)
                    lines.push({ tone: "warn", text: `${e.symbol} ne tient pas hors échantillon (${fmtUsd(v.outPnl)} sur ${v.outN} trades) : prudence.` });
                  else if (v) lines.push({ tone: "ok", text: `${e.symbol} tient hors échantillon (${fmtUsd(v.outPnl)} sur ${v.outN} trades).` });
                  return lines;
                }).concat(accountRecos(general.accountRuns, account, general.per[0]?.e.result!.settings.lots ?? 2))}
              />

              {general.budget !== null && (
                <PlanCard plan={general.plan} per={general.per} budget={general.budget} />
              )}
              {general.accountRuns.length > 1 && (
                <div style={{ overflowX: "auto", marginTop: 18 }}>
                  <div style={{ ...label, fontSize: 11 }}>Tes règles de compte, sur tous les symboles</div>
                  <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th style={th}>Gestion</th>
                        <th style={th}>Trades</th>
                        <th style={th}>Win</th>
                        <th style={th}>PnL</th>
                        <th style={th}>PF</th>
                        <th style={th}>DD clôturé</th>
                        <th style={th}>DD prop</th>
                        <th style={th}>Pire journée</th>
                        <th style={th}>Jours à −{account.dailyStop ?? "—"} $</th>
                        <th style={th}>Objectif {account.target ? `${account.target} $` : ""}</th>
                        <th style={th}>Contrats ouverts max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {general.accountRuns.map(({ label: l, run }) => (
                        <tr key={l}>
                          <td style={{ ...td, fontFamily: "inherit" }}>{l}</td>
                          <td style={td}>
                            {run.n}
                            {run.skipped ? <span style={{ color: "oklch(0.55 0.03 250)" }}> (−{run.skipped})</span> : null}
                          </td>
                          <td style={td}>{pct(run.winRate)}</td>
                          <td style={{ ...td, color: tone(run.pnl), fontWeight: 700 }}>{fmtUsd(run.pnl)}</td>
                          <td style={td}>{fmtPfOrInf(run.pf)}</td>
                          <td style={{ ...td, color: lossColor }}>{fmtUsd(-run.maxDD)}</td>
                          <td style={{ ...td, color: lossColor, fontWeight: run.breachAt ? 700 : undefined }}>
                            {fmtUsd(-run.propDD)}
                            {run.breachAt ? <span style={{ fontSize: 11 }}> · compte sauté le {fmtDay(run.breachAt)}</span> : null}
                          </td>
                          <td style={{ ...td, color: lossColor }}>{fmtUsd(run.worstDay)}</td>
                          <td style={td}>{run.stopDays || "—"}</td>
                          <td style={td}>{run.targetAt ? `${fmtDay(run.targetAt)} (${run.targetSessions} séances)` : "—"}</td>
                          <td style={{ ...td, color: account.maxContracts && run.maxOpen > account.maxContracts ? lossColor : undefined }}>{run.maxOpen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 6 }}>
                    À 1 lot, la sortie moitié TP1 / moitié TP2 n&apos;est possible qu&apos;avec des micros (M6B, M6E) : en lots standards, prends un TP unique ou le
                    trailing sur toute la position.
                  </div>
                </div>
              )}
              <div style={{ overflowX: "auto", marginTop: 18 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th}>Symbole</th>
                      <th style={th}>Config retenue</th>
                      <th style={th}>Trades</th>
                      <th style={th}>Win</th>
                      <th style={th}>TP2</th>
                      <th style={th}>PnL</th>
                      <th style={th}>PF</th>
                      <th style={th}>DD prop</th>
                      <th style={th}>Période</th>
                    </tr>
                  </thead>
                  <tbody>
                    {general.per.map(({ e, c }) => (
                      <tr key={e.symbol} style={{ cursor: "pointer" }} onClick={() => setView(e.symbol)}>
                        <td style={{ ...td, fontWeight: 700 }}>{e.symbol}</td>
                        <td style={td}>{cfgText(c.cfg)}</td>
                        <td style={td}>{c.n}</td>
                        <td style={td}>{pct(c.winRate)}</td>
                        <td style={td}>{c.n && kindOf(c.cfg) === "fixed" ? pct(c.tp2 / c.n) : "—"}</td>
                        <td style={{ ...td, color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl)}</td>
                        <td style={td}>{fmtPfOrInf(c.pf)}</td>
                        <td style={{ ...td, color: lossColor }}>{fmtUsd(-(c.propDD ?? c.maxDD))}</td>
                        <td style={td}>{fmtDay(e.result!.from)} → {fmtDay(e.result!.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ ...label, fontSize: 11, marginTop: 22 }}>Mois par mois</div>
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
            </div>
          ) : (
            <SymbolReport entry={sel} cfg={selCfg} onChoose={(k) => choisir(sel.symbol, k)} />
          )}
        </>
      )}
    </div>
  );
}

function SymbolReport({ entry, cfg, onChoose }: { entry: Entry; cfg: ConfigStats; onChoose: (key: string) => void }) {
  const r = entry.result!;
  const money = r.tickValue * r.settings.lots;
  const months = Object.keys(cfg.months).sort().reverse();
  const zones = Object.entries(cfg.zones).sort(([a], [b]) => Number(a) - Number(b));
  return (
    <div style={glassCard}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={label}>{r.symbol} — {cfgText(cfg.cfg)}</div>
        <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)" }}>
          {fmtDay(r.from)} → {fmtDay(r.to)} · {r.touches} touches de niveau · {r.tested} configs testées · {r.settings.lots} lots
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 20, marginTop: 16 }}>
        <Figure title="PnL" value={fmtUsd(cfg.pnl)} color={tone(cfg.pnl)} hint={`${cfg.netTicks} ticks / contrat`} />
        <Figure
          title="Trades"
          value={String(cfg.n)}
          hint={kindOf(cfg.cfg) === "fixed" ? `${cfg.tp2} TP2 · ${cfg.tp1} TP1 · ${cfg.sl} SL · ${cfg.to} temps` : `${cfg.tr ?? 0} trailing · ${cfg.tp1} BE · ${cfg.sl} SL · ${cfg.to} temps`}
        />
        <Figure title="Winrate" value={pct(cfg.winRate)} />
        <Figure title="Profit factor" value={fmtPfOrInf(cfg.pf)} />
        <Figure title={r.ddMode === "eod" ? "DD suiveur fin de journée" : "DD suiveur intraday"} value={fmtUsd(-(cfg.propDD ?? cfg.maxDD))} color={lossColor} hint={`clôturé : ${fmtUsd(-cfg.maxDD)} · ${r.settings.lots} lots`} />
        <Figure title="PnL ÷ DD" value={ratioOf(cfg).toFixed(2)} hint="ce que rapporte 1 $ de drawdown" />
        {(() => {
          const size = sizeFor(r, cfg);
          return size ? (
            <Figure
              title="Taille max"
              value={size.maxLots >= 1 ? `${size.maxLots} lots` : `${Math.round(size.maxLots * 10)} micros`}
              color={size.maxLots < 0.1 ? lossColor : accentColor}
              hint={`budget ${size.budget.toFixed(0)} $ / paire`}
            />
          ) : null;
        })()}
        <Figure title="Espérance" value={cfg.n ? fmtUsd(cfg.pnl / cfg.n) : "—"} hint="par trade" />
      </div>
      <Equity trades={cfg.trades} money={money} />

      <Recommendations recos={recommend(r, cfg)} />

      {r.rulesImpact && r.rulesImpact.length > 0 && cfg.key === r.top[0]?.key && (
        <div style={{ overflowX: "auto", marginTop: 18 }}>
          <div style={{ ...label, fontSize: 11 }}>Pertinence de tes règles — la config retenue, règle par règle</div>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={th}></th>
                <th style={th}>Trades</th>
                <th style={th}>Win</th>
                <th style={th}>PnL</th>
                <th style={th}>Écart</th>
                <th style={th}>DD prop</th>
              </tr>
            </thead>
            <tbody>
              {r.rulesImpact.map((x, i) => {
                const delta = r.rulesImpact![0].pnl - x.pnl;
                return (
                  <tr key={x.label} style={i === 0 ? { background: "oklch(0.84 0.17 196 / 0.07)" } : undefined}>
                    <td style={{ ...td, fontFamily: "inherit", fontWeight: i === 0 ? 700 : undefined }}>{x.label}</td>
                    <td style={td}>{x.n}</td>
                    <td style={td}>{pct(x.winRate)}</td>
                    <td style={{ ...td, color: tone(x.pnl), fontWeight: 700 }}>{fmtUsd(x.pnl)}</td>
                    <td style={{ ...td, color: i === 0 ? undefined : tone(delta) }}>{i === 0 ? "" : `règle ${delta >= 0 ? "rapporte" : "coûte"} ${fmtUsd(delta)}`}</td>
                    <td style={{ ...td, color: lossColor }}>{fmtUsd(-(x.propDD ?? x.maxDD))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 22, marginTop: 22 }}>
        {r.byNews && r.byNews.length > 1 && (
          <BestTable title="Règle news" rows={r.byNews} render={(v) => NEWS_LABELS[v as NewsMode] ?? v} />
        )}
        {r.byExit && r.byExit.length > 0 && (
          <BestTable title="Meilleure sortie" rows={r.byExit} render={(v) => EXIT_LABELS[v as ExitKind] ?? v} />
        )}
        {r.byTrail && r.byTrail.length > 0 && (
          <BestTable
            title="Meilleur trailing (déclenchement / distance)"
            rows={r.byTrail}
            render={(v) => {
              const [a, d] = v.split("/");
              return `+${a} / ${d}`;
            }}
          />
        )}
        <BestTable title="Meilleure entrée (ticks)" rows={r.byOffset} render={(v) => fmtOffset(Number(v))} />
        <BestTable title="Meilleur SL (ticks)" rows={r.bySl} render={(v) => v} />
        <BestTable
          title="Meilleur TP fixe (TP1 / TP2)"
          rows={r.byTp}
          render={(v) => {
            const [a, b] = v.split("/");
            return a === b ? `${a} unique` : `${a} / ${b}`;
          }}
        />
      </div>
      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.03 250)", marginTop: 6 }}>
        Chaque ligne : le meilleur PnL obtenu avec cette valeur, les autres réglages étant au mieux.
      </div>

      <div style={{ ...label, fontSize: 11, marginTop: 22 }}>Top {r.top.length} des configurations — clique pour la retenir</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22, marginTop: 22 }}>
        <BucketTable title="Par mois" first="Mois" rows={months.map((m) => [monthLabel(m), cfg.months[m]])} />
        <BucketTable title="Par niveau" first="Niveau" rows={zones.map(([z, b]) => [fmtZone(Number(z)), b])} />
        {cfg.dirs && (
          <BucketTable
            title="Par sens"
            first="Sens"
            rows={(["long", "short"] as const).filter((d) => cfg.dirs![d]).map((d) => [d === "long" ? "Long" : "Short", cfg.dirs![d]])}
          />
        )}
        {cfg.news && (
          <BucketTable
            title={`News ${r.newsInfo?.currencies.join("/") ?? ""} (±${r.newsInfo?.window ?? 30} min)`}
            first="Séance"
            rows={[NEWS_BUCKETS.quiet, NEWS_BUCKETS.day, NEWS_BUCKETS.window].filter((k) => cfg.news![k]).map((k) => [k, cfg.news![k]])}
          />
        )}
        {cfg.newsTitles && Object.keys(cfg.newsTitles).length > 0 && (
          <BucketTable
            title="Par annonce (trades du jour)"
            first="Annonce"
            rows={Object.entries(cfg.newsTitles)
              .sort((a, b) => b[1].n - a[1].n)
              .slice(0, 15)}
          />
        )}
        {cfg.hours && (
          <BucketTable
            title={r.hoursTz === "America/Chicago" ? "Par heure (Chicago)" : "Par heure (Paris)"}
            first="Heure"
            rows={Object.entries(cfg.hours)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([h, b]) => [`${h}h–${Number(h) + 1}h`, b])}
          />
        )}
      </div>
    </div>
  );
}
