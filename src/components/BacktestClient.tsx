"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { accentColor, glassCard, winColor, lossColor } from "@/lib/theme";
import { addBacktestTrade, deleteBacktestTest, deleteBacktestTrades, removeBacktestTag, type BacktestInput } from "@/lib/actions/backtest";

export type BacktestRow = {
  id: string;
  date: string;
  testName: string | null;
  symbol: string;
  strategy: string;
  side: string | null;
  slTicks: number;
  tp1Ticks: number;
  tp2Ticks: number;
  lots: number;
  entryOffset: number;
  result: string;
  note: string | null;
  createdAt: string;
};

/**
 * Dollars per tick for one contract, to turn ticks into money — times the lots of each test.
 *
 * CME figures at the time of writing. A symbol missing here is still tested in
 * ticks and R; only the money column stays empty for it.
 */
const TICK_VALUES: Record<string, number> = {
  ES: 12.5, MES: 1.25, NQ: 5, MNQ: 0.5, YM: 5, MYM: 0.5, RTY: 5, M2K: 0.5,
  GC: 10, MGC: 1, SI: 25, CL: 10, MCL: 1, NG: 10,
  "6E": 6.25, "6B": 6.25, "6J": 6.25, "6A": 10, "6C": 10, "6S": 12.5, "6N": 5,
  ZS: 12.5, ZW: 12.5, ZC: 12.5, ZM: 10, ZL: 6, ZB: 31.25, ZN: 15.625, FGBL: 10,
};

const STORE_KEY = "backtest-form";

/**
 * What one test earned, in ticks per contract of the position.
 *
 * Half comes off at TP1 and the stop goes to break-even, so a trade that pays
 * TP1 and comes back keeps half of TP1; one that runs to TP2 averages the two.
 * A stop hit before TP1 loses the whole stop.
 */
function ticksOf(t: BacktestRow) {
  if (t.result === "TP2") return (t.tp1Ticks + t.tp2Ticks) / 2;
  if (t.result === "TP1") return t.tp1Ticks / 2;
  if (t.result === "SL") return -t.slTicks;
  return 0;
}
/** The same, in multiples of the stop. */
const rOf = (t: BacktestRow) => ticksOf(t) / t.slTicks;
/** What a config pays when it runs all the way, in R. */
const fullR = (sl: number, tp1: number, tp2: number) => (tp1 + tp2) / 2 / sl;

type Stats = { n: number; wins: number; tp2: number; losses: number; be: number; netR: number; netTicks: number; money: number | null; pf: number | null };

function stats(rows: BacktestRow[]): Stats {
  let wins = 0, tp2 = 0, losses = 0, be = 0, netR = 0, netTicks = 0, gain = 0, perte = 0;
  let money: number | null = 0;
  for (const t of rows) {
    const r = rOf(t);
    if (t.result === "TP1" || t.result === "TP2") wins++;
    if (t.result === "TP2") tp2++;
    if (t.result === "SL") losses++;
    if (t.result === "BE") be++;
    netR += r;
    if (r > 0) gain += r;
    if (r < 0) perte -= r;
    const tick = ticksOf(t);
    netTicks += tick;
    const tv = TICK_VALUES[t.symbol];
    money = money === null || tv === undefined ? null : money + tick * tv * t.lots;
  }
  return { n: rows.length, wins, tp2, losses, be, netR, netTicks, money, pf: perte > 0 ? gain / perte : gain > 0 ? Infinity : null };
}

/** Share of tests that paid TP1 at least. */
const winRate = (s: Stats) => (s.n ? s.wins / s.n : 0);
/** Share of tests that ran to TP2. */
const tp2Rate = (s: Stats) => (s.n ? s.tp2 / s.n : 0);
const fmtR = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)} R`;
const fmtTicks = (t: number) => `${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.abs(t)} t`;
const fmtUsd = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toFixed(0)}`);
const fmtPf = (pf: number | null) => (pf === null ? "—" : pf === Infinity ? "∞" : pf.toFixed(2));
const fmtOffset = (o: number) => (o === 0 ? "0" : `${o > 0 ? "+" : "−"}${Math.abs(o)}`);
const tone = (v: number) => (v > 0 ? winColor : v < 0 ? lossColor : "oklch(0.75 0.02 250)");

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => `${MOIS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

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
const th: React.CSSProperties = { ...label, fontSize: 11, textAlign: "left", padding: "8px 10px", borderBottom: "1px solid oklch(0.3 0.03 250)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { ...mono, fontSize: 12.5, padding: "8px 10px", borderBottom: "1px solid oklch(0.24 0.03 250)", whiteSpace: "nowrap" };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const EMPTY_FORM: BacktestInput = {
  date: "",
  testName: "",
  symbol: "6E",
  slTicks: 10,
  tp1Ticks: 10,
  tp2Ticks: 20,
  lots: 2,
  entryOffset: 0,
  result: "TP2",
  note: "",
};

function Field({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div style={{ ...label, fontSize: 11, marginBottom: 6 }}>{title}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: "oklch(0.5 0.03 250)", marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

function Figure({ title, value, hint, color }: { title: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <div style={{ ...label, fontSize: 11 }}>{title}</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 700, marginTop: 6, color: color ?? "oklch(0.96 0.0068 250)" }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.03 250)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Select({ value, onChange, options, all }: { value: string; onChange: (v: string) => void; options: string[]; all: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, width: "auto", minWidth: 150 }}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 11.5,
        padding: "5px 10px",
        borderRadius: 5,
        cursor: "pointer",
        border: `1px solid ${active ? accentColor : "oklch(0.34 0.04 250)"}`,
        background: active ? "oklch(0.84 0.17 196 / 0.14)" : "transparent",
        color: active ? accentColor : "oklch(0.7 0.02 250)",
      }}
    >
      {children}
    </button>
  );
}

type ConfigRow = {
  key: string;
  symbol: string;
  sl: number;
  tp1: number;
  tp2: number;
  offset: number;
  s: Stats;
};

type SortKey = "netR" | "exp" | "win" | "n" | "pf";

export default function BacktestClient({
  initialRows,
  symbols,
}: {
  initialRows: BacktestRow[];
  symbols: string[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState<BacktestInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The form keeps its last values between visits: a replay session logs the
  // same symbol and stop dozens of times, and only the outcome moves.
  useEffect(() => {
    let saved: Partial<BacktestInput> = {};
    try {
      saved = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}");
    } catch {
      saved = {};
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own storage, read once after mount
    setForm({ ...EMPTY_FORM, ...saved, date: saved.date || today(), note: "" });
  }, []);
  useEffect(() => {
    if (!form.date) return;
    try {
      const { note: _note, ...rest } = form;
      void _note;
      window.localStorage.setItem(STORE_KEY, JSON.stringify(rest));
    } catch {
      // ignore storage failures
    }
  }, [form]);

  const set = <K extends keyof BacktestInput>(key: K, value: BacktestInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const enregistrer = (result: "SL" | "TP1" | "TP2" | "BE") => {
    setError(null);
    startTransition(async () => {
      try {
        const row = await addBacktestTrade({ ...form, result });
        setRows((rs) => [row, ...rs]);
        set("note", "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      }
    });
  };

  // ---- Filters -----------------------------------------------------------
  const [fTest, setFTest] = useState("");
  const [fSymbol, setFSymbol] = useState("");

  const testNames = useMemo(() => [...new Set(rows.map((r) => r.testName).filter((x): x is string => !!x))].sort(), [rows]);
  const usedSymbols = useMemo(() => [...new Set(rows.map((r) => r.symbol))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!fTest || r.testName === fTest) &&
          (!fSymbol || r.symbol === fSymbol)
      ),
    [rows, fTest, fSymbol]
  );
  const total = useMemo(() => stats(filtered), [filtered]);

  // ---- Configurations ------------------------------------------------------
  const [sort, setSort] = useState<SortKey>("netR");
  const configs = useMemo(() => {
    const groups = new Map<string, BacktestRow[]>();
    for (const r of filtered) {
      const key = [r.symbol, r.slTicks, r.tp1Ticks, r.tp2Ticks, r.entryOffset].join("|");
      const list = groups.get(key);
      if (list) list.push(r);
      else groups.set(key, [r]);
    }
    const out: ConfigRow[] = [...groups.entries()].map(([key, list]) => ({
      key,
      symbol: list[0].symbol,
      sl: list[0].slTicks,
      tp1: list[0].tp1Ticks,
      tp2: list[0].tp2Ticks,
      offset: list[0].entryOffset,
      s: stats(list),
    }));
    const val = (c: ConfigRow) =>
      sort === "netR" ? c.s.netR : sort === "exp" ? c.s.netR / c.s.n : sort === "win" ? winRate(c.s) : sort === "n" ? c.s.n : c.s.pf === Infinity ? 1e9 : c.s.pf ?? -1;
    return out.sort((a, b) => val(b) - val(a));
  }, [filtered, sort]);
  const best = configs.length > 1 ? configs.reduce((a, b) => (b.s.netR / b.s.n > a.s.netR / a.s.n ? b : a)) : null;

  // ---- By month --------------------------------------------------------------
  const [colBy, setColBy] = useState<"symbol" | "config">("symbol");
  const colOf = (r: BacktestRow) =>
    colBy === "symbol" ? r.symbol : `${r.symbol} · ${r.slTicks}/${r.tp1Ticks}/${r.tp2Ticks}${r.entryOffset ? ` · e${fmtOffset(r.entryOffset)}` : ""}`;
  const monthly = useMemo(() => {
    const cols = [...new Set(filtered.map(colOf))].sort();
    const months = [...new Set(filtered.map((r) => monthKey(r.date)))].sort().reverse();
    const cell = new Map<string, BacktestRow[]>();
    for (const r of filtered) {
      const k = `${monthKey(r.date)}|${colOf(r)}`;
      const list = cell.get(k);
      if (list) list.push(r);
      else cell.set(k, [r]);
    }
    return { cols, months, cell };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colOf only reads colBy
  }, [filtered, colBy]);

  // ---- List ------------------------------------------------------------------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(50);
  const supprimer = (ids: string[]) => {
    if (!ids.length || !confirm(ids.length === 1 ? "Supprimer ce test ?" : `Supprimer ${ids.length} tests ?`)) return;
    const partis = new Set(ids);
    startTransition(async () => {
      await deleteBacktestTrades(ids);
      setRows((rs) => rs.filter((r) => !partis.has(r.id)));
      setSelected((s) => new Set([...s].filter((id) => !partis.has(id))));
    });
  };
  /** A test's name, taken off its rows or taken away with them. */
  const retirerTag = (name: string, avecTests: boolean) => {
    const n = rows.filter((r) => r.testName === name).length;
    const question = avecTests
      ? `Supprimer le test « ${name} » et ses ${n} tests ? C'est définitif.`
      : `Retirer le tag « ${name} » ? Les ${n} tests restent, sans nom de test.`;
    if (!confirm(question)) return;
    startTransition(async () => {
      if (avecTests) {
        await deleteBacktestTest(name);
        const partis = new Set(rows.filter((r) => r.testName === name).map((r) => r.id));
        setRows((rs) => rs.filter((r) => r.testName !== name));
        setSelected((s) => new Set([...s].filter((id) => !partis.has(id))));
      } else {
        await removeBacktestTag(name);
        setRows((rs) => rs.map((r) => (r.testName === name ? { ...r, testName: null } : r)));
      }
      setFTest("");
      // The form would otherwise file the next setup under the name just removed.
      setForm((f) => (f.testName === name ? { ...f, testName: "" } : f));
    });
  };

  // "All" is what the filters show, so a whole test or symbol can go at once.
  const tousCoches = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const rr = form.slTicks > 0 ? fullR(form.slTicks, form.tp1Ticks, form.tp2Ticks) : 0;
  const tv = TICK_VALUES[form.symbol.trim().toUpperCase()];

  const sortHeader = (key: SortKey, text: string) => (
    <th style={{ ...th, cursor: "pointer", color: sort === key ? accentColor : th.color }} onClick={() => setSort(key)}>
      {text}
      {sort === key ? " ↓" : ""}
    </th>
  );

  return (
    <div>
      {/* ---- Entry ---- */}
      <div style={{ ...glassCard, marginBottom: 20 }}>
        <div style={label}>Nouveau test</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16, marginTop: 16 }}>
          <Field title="Date">
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="Test" hint="ex. « 6E Q3 », facultatif">
            <input list="bt-tests" value={form.testName} onChange={(e) => set("testName", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="Symbole">
            <input list="bt-symbols" value={form.symbol} onChange={(e) => set("symbol", e.target.value)} style={fieldStyle} />
          </Field>
          <Field title="SL (ticks)">
            <input type="number" min={0} value={form.slTicks} onChange={(e) => set("slTicks", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="TP1 (ticks)" hint="½ position, SL → BE">
            <input type="number" min={0} value={form.tp1Ticks} onChange={(e) => set("tp1Ticks", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="TP2 (ticks)" hint="½ position">
            <input type="number" min={0} value={form.tp2Ticks} onChange={(e) => set("tp2Ticks", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Lots" hint="moitié à TP1, moitié à TP2">
            <input type="number" min={1} value={form.lots} onChange={(e) => set("lots", Number(e.target.value))} style={fieldStyle} />
          </Field>
          <Field title="Entrée (± ticks)" hint="+ plus haute, − plus basse">
            <input type="number" value={form.entryOffset} onChange={(e) => set("entryOffset", Number(e.target.value))} style={fieldStyle} />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <Field title="Note">
            <input value={form.note} onChange={(e) => set("note", e.target.value)} style={fieldStyle} placeholder="facultatif" />
          </Field>
        </div>
        <datalist id="bt-tests">{testNames.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="bt-symbols">{symbols.map((t) => <option key={t} value={t} />)}</datalist>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          {(
            [
              ["TP2", "TP2 touché", winColor],
              ["TP1", "TP1 puis BE", "oklch(0.78 0.11 196)"],
              ["SL", "SL touché", lossColor],
              ["BE", "Sorti à 0", "oklch(0.75 0.02 250)"],
            ] as const
          ).map(([res, text, color]) => (
            <button
              key={res}
              type="button"
              disabled={pending}
              onClick={() => enregistrer(res)}
              style={{
                ...mono,
                fontSize: 13,
                fontWeight: 700,
                padding: "10px 18px",
                borderRadius: 6,
                cursor: pending ? "wait" : "pointer",
                border: `1px solid ${color}`,
                background: "transparent",
                color,
              }}
            >
              {text}
            </button>
          ))}
          <span style={{ ...mono, fontSize: 12, color: "oklch(0.6 0.03 250)" }}>
            jusqu&apos;à TP2 : {rr.toFixed(2)} R · TP1 puis BE : {form.slTicks > 0 ? (form.tp1Ticks / 2 / form.slTicks).toFixed(2) : "0.00"} R
            {tv !== undefined &&
              ` · ${form.lots} lot(s) : risque ${(form.slTicks * tv * form.lots).toFixed(0)} $ · TP1 puis BE +${((form.tp1Ticks / 2) * tv * form.lots).toFixed(0)} $ · TP2 +${(((form.tp1Ticks + form.tp2Ticks) / 2) * tv * form.lots).toFixed(0)} $`}
          </span>
          {error && <span style={{ fontSize: 12.5, color: lossColor }}>{error}</span>}
        </div>
      </div>

      {/* ---- Filters ---- */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <Select value={fTest} onChange={setFTest} options={testNames} all="Tous les tests" />
        {fTest && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => retirerTag(fTest, false)}
              style={{ ...mono, fontSize: 12, padding: "6px 12px", borderRadius: 5, border: "1px solid oklch(0.34 0.04 250)", background: "transparent", color: "oklch(0.8 0.02 250)", cursor: "pointer" }}
            >
              Retirer le tag
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => retirerTag(fTest, true)}
              style={{ ...mono, fontSize: 12, padding: "6px 12px", borderRadius: 5, border: `1px solid ${lossColor}`, background: "transparent", color: lossColor, cursor: "pointer" }}
            >
              Supprimer le tag et ses {rows.filter((r) => r.testName === fTest).length} tests
            </button>
          </>
        )}
        <Select value={fSymbol} onChange={setFSymbol} options={usedSymbols} all="Tous les symboles" />
      </div>

      {rows.length === 0 ? (
        <div style={{ ...glassCard, color: "oklch(0.62 0.034 250)", fontSize: 14 }}>
          Aucun test pour l&apos;instant. Règle symbole, SL, TP1 et TP2, puis appuie sur « TP2 touché », « TP1 puis BE » ou « SL touché » à chaque setup du replay.
        </div>
      ) : (
        <>
          {/* ---- Totals ---- */}
          <div style={{ ...glassCard, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 20 }}>
              <Figure title="PnL total" value={fmtUsd(total.money)} color={total.money === null ? undefined : tone(total.money)} hint={total.money === null ? "valeur du tick inconnue pour un symbole" : `${total.n} tests, lots compris`} />
              <Figure title="Tests" value={String(total.n)} hint={`${total.tp2} TP2 · ${total.wins - total.tp2} TP1 · ${total.losses} SL · ${total.be} à 0`} />
              <Figure title="TP1 atteint" value={`${(winRate(total) * 100).toFixed(1)} %`} hint={`TP2 : ${(tp2Rate(total) * 100).toFixed(1)} %`} />
              <Figure title="Résultat" value={fmtR(total.netR)} color={tone(total.netR)} hint={fmtTicks(total.netTicks)} />
              <Figure title="Espérance" value={total.n ? fmtR(total.netR / total.n) : "—"} color={tone(total.netR)} hint="par trade" />
              <Figure title="Profit factor" value={fmtPf(total.pf)} />
            </div>
          </div>

          {/* ---- Configurations ---- */}
          <div style={{ ...glassCard, marginBottom: 20 }}>
            <div style={label}>Comparaison des configurations</div>
            <div style={{ fontSize: 12.5, color: "oklch(0.55 0.03 250)", marginTop: 4 }}>
              Une ligne par symbole · SL · TP1 · TP2 · entrée. ½ position à TP1 avec SL au BE, ½ à TP2. Clique un en-tête pour trier.
            </div>
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={th}>Symbole</th>
                    <th style={th}>SL</th>
                    <th style={th}>TP1</th>
                    <th style={th}>TP2</th>
                    <th style={th}>Entrée</th>
                    <th style={th}>R max</th>
                    {sortHeader("n", "Tests")}
                    {sortHeader("win", "% TP1")}
                    <th style={th}>% TP2</th>
                    {sortHeader("netR", "Résultat")}
                    {sortHeader("exp", "Espérance")}
                    {sortHeader("pf", "PF")}
                    <th style={th}>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <tr key={c.key} style={{ background: best?.key === c.key ? "oklch(0.84 0.17 196 / 0.07)" : undefined }}>
                      <td style={td}>
                        {c.symbol}
                        {best?.key === c.key && <span style={{ color: accentColor, marginLeft: 6, fontSize: 11, fontFamily: "var(--font-space-grotesk), sans-serif" }}>★ meilleure espérance</span>}
                      </td>
                      <td style={td}>{c.sl}</td>
                      <td style={td}>{c.tp1}</td>
                      <td style={td}>{c.tp2}</td>
                      <td style={td}>{fmtOffset(c.offset)}</td>
                      <td style={td}>{fullR(c.sl, c.tp1, c.tp2).toFixed(2)}</td>
                      <td style={td}>{c.s.n}</td>
                      <td style={td}>{(winRate(c.s) * 100).toFixed(0)} %</td>
                      <td style={td}>{(tp2Rate(c.s) * 100).toFixed(0)} %</td>
                      <td style={{ ...td, color: tone(c.s.netR), fontWeight: 700 }}>{fmtR(c.s.netR)}</td>
                      <td style={{ ...td, color: tone(c.s.netR) }}>{fmtR(c.s.netR / c.s.n)}</td>
                      <td style={td}>{fmtPf(c.s.pf)}</td>
                      <td style={{ ...td, color: c.s.money === null ? undefined : tone(c.s.money) }}>{fmtUsd(c.s.money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- By month ---- */}
          <div style={{ ...glassCard, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={label}>Par mois</div>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                <Pill active={colBy === "symbol"} onClick={() => setColBy("symbol")}>par symbole</Pill>
                <Pill active={colBy === "config"} onClick={() => setColBy("config")}>par config</Pill>
              </div>
            </div>
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={th}>Mois</th>
                    {monthly.cols.map((c) => (
                      <th key={c} style={{ ...th, textTransform: colBy === "config" ? "none" : th.textTransform }}>
                        {c}
                      </th>
                    ))}
                    <th style={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.months.map((m) => {
                    const dansMois = filtered.filter((r) => monthKey(r.date) === m);
                    const tot = stats(dansMois);
                    return (
                      <tr key={m}>
                        <td style={{ ...td, fontFamily: "inherit" }}>{monthLabel(m)}</td>
                        {monthly.cols.map((c) => {
                          const list = monthly.cell.get(`${m}|${c}`);
                          if (!list) return <td key={c} style={{ ...td, color: "oklch(0.4 0.02 250)" }}>—</td>;
                          const s = stats(list);
                          return (
                            <td key={c} style={td}>
                              <div style={{ color: tone(s.netR), fontWeight: 700 }}>{fmtR(s.netR)}</div>
                              {s.money !== null && <div style={{ color: tone(s.money), fontSize: 12 }}>{fmtUsd(s.money)}</div>}
                              <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)" }}>
                                {s.n} tests · TP1 {(winRate(s) * 100).toFixed(0)} %
                              </div>
                            </td>
                          );
                        })}
                        <td style={td}>
                          <div style={{ color: tone(tot.netR), fontWeight: 700 }}>{fmtR(tot.netR)}</div>
                          {tot.money !== null && <div style={{ color: tone(tot.money), fontSize: 12 }}>{fmtUsd(tot.money)}</div>}
                          <div style={{ fontSize: 11, color: "oklch(0.55 0.03 250)" }}>
                            {tot.n} tests · TP1 {(winRate(tot) * 100).toFixed(0)} %
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- List ---- */}
          <div style={glassCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={label}>Tests ({filtered.length})</div>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => supprimer([...selected])}
                  disabled={pending}
                  style={{ ...mono, fontSize: 12, marginLeft: "auto", padding: "6px 12px", borderRadius: 5, border: `1px solid ${lossColor}`, background: "transparent", color: lossColor, cursor: "pointer" }}
                >
                  Supprimer {selected.size}
                </button>
              )}
            </div>
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={th}>
                      <input
                        type="checkbox"
                        title="Tout cocher (tests filtrés)"
                        checked={tousCoches}
                        onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())}
                      />
                    </th>
                    <th style={th}>Date</th>
                    <th style={th}>Test</th>
                    <th style={th}>Symbole</th>
                    <th style={th}>SL / TP1 / TP2</th>
                    <th style={th}>Lots</th>
                    <th style={th}>Entrée</th>
                    <th style={th}>Résultat</th>
                    <th style={th}>PnL</th>
                    <th style={th}>Note</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((r) => {
                    const v = rOf(r);
                    return (
                      <tr key={r.id}>
                        <td style={td}>
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={(e) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td style={td}>{r.date.slice(0, 10)}</td>
                        <td style={{ ...td, fontFamily: "inherit" }}>{r.testName ?? "—"}</td>
                        <td style={td}>{r.symbol}</td>
                        <td style={td}>
                          {r.slTicks} / {r.tp1Ticks} / {r.tp2Ticks}
                        </td>
                        <td style={td}>{r.lots}</td>
                        <td style={td}>{fmtOffset(r.entryOffset)}</td>
                        <td style={{ ...td, color: tone(v), fontWeight: 700 }}>
                          {r.result} {fmtR(v)}
                        </td>
                        <td style={{ ...td, color: tone(v) }}>{fmtUsd(stats([r]).money)}</td>
                        <td style={{ ...td, fontFamily: "inherit", whiteSpace: "normal", color: "oklch(0.7 0.02 250)" }}>{r.note}</td>
                        <td style={td}>
                          <button
                            type="button"
                            title="Supprimer ce test"
                            disabled={pending}
                            onClick={() => supprimer([r.id])}
                            style={{ border: "none", background: "transparent", color: lossColor, cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > shown && (
              <button
                type="button"
                onClick={() => setShown((s) => s + 100)}
                style={{ ...mono, fontSize: 12, marginTop: 12, padding: "6px 12px", borderRadius: 5, border: "1px solid oklch(0.34 0.04 250)", background: "transparent", color: "oklch(0.75 0.02 250)", cursor: "pointer" }}
              >
                Afficher plus
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
