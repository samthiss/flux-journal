/**
 * Databento OHLCV files, read in the browser.
 *
 * The CSV the portal writes, in either of its two shapes: timestamps as
 * nanoseconds or as ISO text, prices as fixed-point integers (1e-9) or as
 * decimals. A file bought on a parent symbol (6E.FUT) holds every contract
 * month and the spreads between them; the spreads are dropped and, day by day,
 * the contract that traded the most is kept — the front month, rolled when the
 * volume rolls. A continuous symbol (6E.c.0) has already been rolled and goes
 * through untouched.
 */

export type Bars = {
  t: Float64Array; // ms since epoch, start of the minute
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
};

export type Dataset = Bars & { symbol: string; from: number; to: number; n: number; importedAt: number };

/** The root a Databento symbol belongs to: 6EZ5 → 6E, 6E.c.0 → 6E. */
export function rootOf(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.includes(".")) return s.split(".")[0];
  const m = /^(.+?)[FGHJKMNQUVXZ]\d{1,2}$/.exec(s);
  return m ? m[1] : s;
}

function parseTime(s: string): number {
  // Nanoseconds as an integer: cut the last six digits rather than divide, a
  // nanosecond count does not fit in a double exactly.
  if (/^\d+$/.test(s)) return Number(s.slice(0, -6));
  // ISO with nine fractional digits, which Date.parse does not read.
  return Date.parse(s.replace(/\.(\d{3})\d*/, ".$1"));
}

type Row = { t: number; o: number; h: number; l: number; c: number; v: number; contract: string };

export function parseDatabentoCsv(text: string, fallbackSymbol: string | null): Dataset[] {
  const firstBreak = text.indexOf("\n");
  const header = text.slice(0, firstBreak).trim().split(",");
  const col = (name: string) => header.indexOf(name);
  const iT = col("ts_event") >= 0 ? col("ts_event") : col("ts_recv");
  const iO = col("open"), iH = col("high"), iL = col("low"), iC = col("close"), iV = col("volume"), iS = col("symbol");
  if (iT < 0 || iO < 0 || iH < 0 || iL < 0 || iC < 0) {
    throw new Error("Ce fichier n'a pas les colonnes d'un OHLCV Databento (ts_event, open, high, low, close).");
  }
  if (iS < 0 && !fallbackSymbol) throw new Error("Le fichier n'a pas de colonne symbol : choisis le symbole avant d'importer.");

  // Fixed-point or decimal is decided once, on the first row.
  let scale = 0;

  const byRoot = new Map<string, Row[]>();
  let pos = firstBreak + 1;
  while (pos < text.length) {
    let next = text.indexOf("\n", pos);
    if (next < 0) next = text.length;
    const line = text.slice(pos, next);
    pos = next + 1;
    if (line.length < 5) continue;
    const f = line.split(",");
    const contract = iS >= 0 ? f[iS].trim().replace(/^"|"$/g, "") : fallbackSymbol!;
    // Spreads and combinations: "6EZ5-6EH6".
    if (contract.includes("-") || contract.includes(" ")) continue;
    if (scale === 0) scale = !f[iO].includes(".") && Math.abs(Number(f[iO])) > 1e6 ? 1e-9 : 1;
    const row: Row = {
      t: parseTime(f[iT].trim()),
      o: Number(f[iO]) * scale,
      h: Number(f[iH]) * scale,
      l: Number(f[iL]) * scale,
      c: Number(f[iC]) * scale,
      v: iV >= 0 ? Number(f[iV]) : 0,
      contract,
    };
    if (!Number.isFinite(row.t) || !Number.isFinite(row.h) || !Number.isFinite(row.l)) continue;
    const root = fallbackSymbol && iS < 0 ? fallbackSymbol : rootOf(contract);
    const list = byRoot.get(root);
    if (list) list.push(row);
    else byRoot.set(root, [row]);
  }

  const out: Dataset[] = [];
  for (const [symbol, rows] of byRoot) {
    // The front month, day by day.
    const volume = new Map<string, number>();
    for (const r of rows) {
      const k = `${Math.floor(r.t / 86400000)}|${r.contract}`;
      volume.set(k, (volume.get(k) ?? 0) + r.v);
    }
    const front = new Map<number, string>();
    const best = new Map<number, number>();
    for (const [k, v] of volume) {
      const [day, contract] = k.split("|");
      const d = Number(day);
      if (v > (best.get(d) ?? -1)) {
        best.set(d, v);
        front.set(d, contract);
      }
    }
    const kept = rows.filter((r) => front.get(Math.floor(r.t / 86400000)) === r.contract).sort((a, b) => a.t - b.t);
    out.push(toDataset(symbol, kept));
  }
  return out;
}

function toDataset(symbol: string, rows: { t: number; o: number; h: number; l: number; c: number }[]): Dataset {
  // One bar per minute: a duplicate keeps the last one read.
  const uniq: typeof rows = [];
  for (const r of rows) {
    if (uniq.length && uniq[uniq.length - 1].t === r.t) uniq[uniq.length - 1] = r;
    else uniq.push(r);
  }
  const n = uniq.length;
  const d: Dataset = {
    symbol,
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
    from: n ? uniq[0].t : 0,
    to: n ? uniq[n - 1].t : 0,
    n,
    importedAt: Date.now(),
  };
  uniq.forEach((r, i) => {
    d.t[i] = r.t;
    d.o[i] = r.o;
    d.h[i] = r.h;
    d.l[i] = r.l;
    d.c[i] = r.c;
  });
  return d;
}

/** Two imports of one symbol, as one history: where they overlap, the newer wins. */
export function mergeDatasets(old: Dataset, neu: Dataset): Dataset {
  const rows: { t: number; o: number; h: number; l: number; c: number }[] = [];
  for (const d of [old, neu]) for (let i = 0; i < d.n; i++) rows.push({ t: d.t[i], o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i] });
  rows.sort((a, b) => a.t - b.t);
  return toDataset(neu.symbol, rows);
}
