"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { CONTRACTS } from "@/lib/contracts";
import { Field, Figure, Pill, fieldStyle, fmtOffset, fmtUsd, label, mono, monthLabel, td, th, tone } from "@/components/BacktestUi";
import { parseDatabentoCsv, mergeDatasets, type Dataset } from "@/lib/databento/parse";
import { deleteDataset, loadDataset, loadDatasets, saveDataset } from "@/lib/databento/store";
import { analyse, configsOf, monthOf, type Best, type ConfigStats, type Grid, type Settings, type SymbolResult } from "@/lib/databento/engine";
import { chooseDatabentoConfig, deleteDatabentoSymbol, saveDatabentoResult, saveDatabentoZones } from "@/lib/actions/databento";

type Saved = { symbol: string; zones: number[]; result: string | null; chosenKey: string | null };
type Entry = { symbol: string; zones: number[]; result: SymbolResult | null; chosenKey: string | null };

const SETTINGS_KEY = "databento-settings";

const DEFAULT_GRID: Grid = { offsets: [-4, -2, 0, 2, 4], sls: [6, 8, 10, 12, 15, 20], tp1s: [5, 10, 15, 20], tp2s: [10, 20, 30, 40] };
const DEFAULT_SETTINGS: Settings = { lots: 2, rearm: 30, maxHours: 24, minTrades: 10 };

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
const cfgText = (c: ConfigStats["cfg"]) =>
  `Entrée ${fmtOffset(c.offset)} · SL ${c.sl} · ${c.tp1 === c.tp2 ? `TP ${c.tp1}` : `TP1 ${c.tp1} / TP2 ${c.tp2}`}`;

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
function Equity({ trades, money }: { trades: [number, number][]; money: number }) {
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

function BestTable({ title, rows, render }: { title: string; rows: Best[]; render: (v: string) => string }) {
  const top = rows.reduce<Best | null>((a, b) => (!a || b.pnl > a.pnl ? b : a), null);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>{title}</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}></th>
            <th style={th}>Trades</th>
            <th style={th}>Win</th>
            <th style={th}>PnL max</th>
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
  const [gridText, setGridText] = useState<Record<keyof Grid, string>>({
    offsets: fmtList(DEFAULT_GRID.offsets),
    sls: fmtList(DEFAULT_GRID.sls),
    tp1s: fmtList(DEFAULT_GRID.tp1s),
    tp2s: fmtList(DEFAULT_GRID.tp2s),
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (saved?.grid && saved?.settings) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own storage, read once after mount
        setGrid(saved.grid);
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setGridText({
          offsets: fmtList(saved.grid.offsets),
          sls: fmtList(saved.grid.sls),
          tp1s: fmtList(saved.grid.tp1s),
          tp2s: fmtList(saved.grid.tp2s),
        });
      }
    } catch {
      // ignore storage failures
    }
    loadDatasets()
      .then((ds) => setDatasets(ds.map((d) => ({ symbol: d.symbol, from: d.from, to: d.to, n: d.n, importedAt: d.importedAt }))))
      .catch(() => setMessage({ text: "Le stockage local du navigateur n'est pas disponible.", error: true }));
  }, []);
  const saveSettings = (g: Grid, s: Settings) => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ grid: g, settings: s }));
    } catch {
      // ignore storage failures
    }
  };
  const setGridField = (k: keyof Grid, text: string) => {
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
  const nConfigs = useMemo(() => configsOf(grid).length, [grid]);

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
      for (const file of Array.from(files)) {
        if (/\.(zst|zstd)$/i.test(file.name)) {
          throw new Error(`${file.name} est compressé (zstd). Retélécharge-le sur Databento avec « Compression : None », ou décompresse-le d'abord.`);
        }
        if (/\.dbn$/i.test(file.name)) throw new Error(`${file.name} est au format DBN : choisis l'encodage CSV sur Databento.`);
        setProgress(`Lecture de ${file.name}…`);
        await new Promise((r) => setTimeout(r, 0));
        const text = await file.text();
        const parsed = parseDatabentoCsv(text, fallbackSymbol.trim().toUpperCase() || null);
        if (!parsed.length) throw new Error(`${file.name} : aucune bougie lue.`);
        for (const d of parsed) {
          const old = await loadDataset(d.symbol);
          const merged = old ? mergeDatasets(old, d) : d;
          await saveDataset(merged);
          lus.push(`${d.symbol} : ${d.n.toLocaleString("fr-FR")} bougies (${fmtDay(d.from)} → ${fmtDay(d.to)})`);
        }
      }
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
      setMessage({ text: "Aucune configuration à tester : vérifie les listes (TP2 doit être ≥ TP1).", error: true });
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
        const r = await analyse(s, d, entryOf(s).zones, spec.tickSize, spec.tickValue, grid, settings, (done, total) =>
          setProgress(`${s} : ${done} / ${total} configurations`)
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
    return { per, trades, pnl: eq, maxDD, pf: loss > 0 ? win / loss : win > 0 ? null : 0, winRate: trades.length ? wins / trades.length : 0, months, cell };
  }, [analysed]);

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
          Un deuxième fichier du même symbole complète le premier.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
          <Field title="Fichiers CSV">
            <input type="file" accept=".csv,text/csv" multiple disabled={busy} onChange={(e) => { void importer(e.target.files); e.target.value = ""; }} style={{ ...fieldStyle, width: 320 }} />
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
          <Field title="Lots">
            <input type="number" min={1} value={settings.lots} onChange={(e) => setSetting("lots", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Réarmement (ticks)" hint="distance pour qu'un retour compte comme nouvelle touche">
            <input type="number" min={1} value={settings.rearm} onChange={(e) => setSetting("rearm", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Durée max (heures)" hint="sinon sortie au prix du moment">
            <input type="number" min={1} value={settings.maxHours} onChange={(e) => setSetting("maxHours", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Trades minimum" hint="pour qu'une config soit classée">
            <input type="number" min={1} value={settings.minTrades} onChange={(e) => setSetting("minTrades", Number(e.target.value))} style={fieldStyle} />
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={lancer} style={{ ...btn(accentColor, true), padding: "10px 18px", fontSize: 13.5, cursor: busy ? "wait" : "pointer" }}>
            Lancer l&apos;analyse
          </button>
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
                <Figure title="Drawdown max" value={fmtUsd(-general.maxDD)} color={general.maxDD ? lossColor : undefined} />
                <Figure
                  title="Par mois"
                  value={general.months.length ? fmtUsd(general.pnl / general.months.length) : "—"}
                  hint={`${general.months.filter((m) => general.cell(m, null).pnl > 0).length} / ${general.months.length} mois positifs`}
                />
              </div>
              <Equity trades={general.trades.map((t) => [0, t.pnl])} money={1} />

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
                      <th style={th}>DD max</th>
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
                        <td style={td}>{c.n ? pct(c.tp2 / c.n) : "—"}</td>
                        <td style={{ ...td, color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl)}</td>
                        <td style={td}>{fmtPfOrInf(c.pf)}</td>
                        <td style={{ ...td, color: lossColor }}>{fmtUsd(-c.maxDD)}</td>
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
        <Figure title="Trades" value={String(cfg.n)} hint={`${cfg.tp2} TP2 · ${cfg.tp1} TP1 · ${cfg.sl} SL · ${cfg.to} temps`} />
        <Figure title="Winrate" value={pct(cfg.winRate)} />
        <Figure title="TP2 atteint" value={cfg.n ? pct(cfg.tp2 / cfg.n) : "—"} />
        <Figure title="Profit factor" value={fmtPfOrInf(cfg.pf)} />
        <Figure title="Drawdown max" value={fmtUsd(-cfg.maxDD)} color={cfg.maxDD ? lossColor : undefined} />
        <Figure title="Espérance" value={cfg.n ? fmtUsd(cfg.pnl / cfg.n) : "—"} hint="par trade" />
      </div>
      <Equity trades={cfg.trades} money={money} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 22, marginTop: 22 }}>
        <BestTable title="Meilleure entrée (ticks)" rows={r.byOffset} render={(v) => fmtOffset(Number(v))} />
        <BestTable title="Meilleur SL (ticks)" rows={r.bySl} render={(v) => v} />
        <BestTable
          title="Meilleur TP (TP1 / TP2)"
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
              <th style={th}>TP1</th>
              <th style={th}>TP2</th>
              <th style={th}>Trades</th>
              <th style={th}>Win</th>
              <th style={th}>TP2</th>
              <th style={th}>PnL</th>
              <th style={th}>PF</th>
              <th style={th}>DD max</th>
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
                  <td style={td}>{c.cfg.tp1}</td>
                  <td style={td}>{c.cfg.tp2}</td>
                  <td style={td}>{c.n}</td>
                  <td style={td}>{pct(c.winRate)}</td>
                  <td style={td}>{c.n ? pct(c.tp2 / c.n) : "—"}</td>
                  <td style={{ ...td, color: tone(c.pnl), fontWeight: 700 }}>{fmtUsd(c.pnl)}</td>
                  <td style={td}>{fmtPfOrInf(c.pf)}</td>
                  <td style={{ ...td, color: lossColor }}>{fmtUsd(-c.maxDD)}</td>
                  <td style={td}>{ms.filter((m) => m.pnl > 0).length} / {ms.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, marginTop: 22 }}>
        <div>
          <div style={{ ...label, fontSize: 11 }}>Par mois</div>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
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
                return (
                  <tr key={m}>
                    <td style={{ ...td, fontFamily: "inherit" }}>{monthLabel(m)}</td>
                    <td style={td}>{b.n}</td>
                    <td style={td}>{pct(b.wins / b.n)}</td>
                    <td style={{ ...td, color: tone(b.pnl), fontWeight: 700 }}>{fmtUsd(b.pnl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ ...label, fontSize: 11 }}>Par niveau</div>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={th}>Niveau</th>
                <th style={th}>Trades</th>
                <th style={th}>Win</th>
                <th style={th}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(([z, b]) => (
                <tr key={z}>
                  <td style={td}>{fmtZone(Number(z))}</td>
                  <td style={td}>{b.n}</td>
                  <td style={td}>{pct(b.wins / b.n)}</td>
                  <td style={{ ...td, color: tone(b.pnl), fontWeight: 700 }}>{fmtUsd(b.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
