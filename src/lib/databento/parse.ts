/**
 * Databento files, read in the browser.
 *
 * The CSV the portal writes, in either of its two shapes: timestamps as
 * nanoseconds or as ISO text, prices as fixed-point integers (1e-9) or as
 * decimals. Bars (OHLCV) are read as they are; trades — one line per fill,
 * a price and a size — are built into one-minute bars first. A CSV of bars
 * written by something else is read too, as long as it has a time column and
 * open, high, low, close. A file bought on a parent symbol (6E.FUT) holds every contract
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
  if (/^\d+$/.test(s)) {
    // Nanoseconds as an integer: cut the last six digits rather than divide, a
    // nanosecond count does not fit in a double exactly.
    if (s.length >= 16) return Number(s.slice(0, -6));
    // Milliseconds, or seconds.
    return s.length >= 13 ? Number(s) : Number(s) * 1000;
  }
  // ISO with nine fractional digits, which Date.parse does not read, and
  // "2025-11-13 00:00:00+00:00", which not every browser reads with a space.
  return Date.parse(s.replace(" ", "T").replace(/\.(\d{3})\d*/, ".$1"));
}

const TIME_COLUMNS = ["ts_event", "ts_recv", "datetime", "timestamp", "time", "date"];

type Row = { t: number; o: number; h: number; l: number; c: number; v: number; contract: string };

export function parseDatabentoCsv(text: string, fallbackSymbol: string | null): Dataset[] {
  const firstBreak = text.indexOf("\n");
  const headerLine = text.slice(0, firstBreak < 0 ? text.length : firstBreak).replace(/^\uFEFF/, "").trim();
  const sep = headerLine.includes("\t") ? "\t" : headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
  const header = headerLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iT = TIME_COLUMNS.map(col).find((i) => i >= 0) ?? -1;
  const iO = col("open"), iH = col("high"), iL = col("low"), iC = col("close"), iS = col("symbol");
  const iP = col("price");
  const iV = col("volume") >= 0 ? col("volume") : col("size");
  const bars = iO >= 0 && iH >= 0 && iL >= 0 && iC >= 0;
  const trades = !bars && iP >= 0;
  if (iT < 0 || (!bars && !trades)) {
    throw new Error(
      `Colonnes non reconnues (${header.join(", ")}). Il faut des bougies (temps, open, high, low, close) ou des trades Databento (ts_event, price, size).`
    );
  }
  // An action column means a market-by-order style file: only fills are trades.
  const iA = col("action");
  if (iS < 0 && !fallbackSymbol) throw new Error("Le fichier n'a pas de colonne symbol : choisis le symbole avant d'importer.");

  // Fixed-point or decimal is decided once, on the first row.
  let scale = 0;
  const px = (s: string) => {
    if (scale === 0) scale = !s.includes(".") && Math.abs(Number(s)) > 1e6 ? 1e-9 : 1;
    return Number(s) * scale;
  };

  const byRoot = new Map<string, Row[]>();
  // Trades become bars as they are read, one per contract and minute.
  const minutes = new Map<string, Row>();
  const add = (root: string, row: Row) => {
    const list = byRoot.get(root);
    if (list) list.push(row);
    else byRoot.set(root, [row]);
  };

  let pos = firstBreak < 0 ? text.length : firstBreak + 1;
  while (pos < text.length) {
    let next = text.indexOf("\n", pos);
    if (next < 0) next = text.length;
    const line = text.slice(pos, next);
    pos = next + 1;
    if (line.length < 5) continue;
    const f = line.split(sep);
    const contract = iS >= 0 ? f[iS].trim().replace(/^"|"$/g, "") : fallbackSymbol!;
    // Spreads and combinations: "6EZ5-6EH6".
    if (!contract || contract.includes("-") || contract.includes(" ")) continue;
    const t = parseTime(f[iT].trim().replace(/^"|"$/g, ""));
    if (!Number.isFinite(t)) continue;
    const root = fallbackSymbol && iS < 0 ? fallbackSymbol : rootOf(contract);

    if (bars) {
      const row: Row = { t, o: px(f[iO]), h: px(f[iH]), l: px(f[iL]), c: px(f[iC]), v: iV >= 0 ? Number(f[iV]) || 0 : 0, contract };
      if (Number.isFinite(row.h) && Number.isFinite(row.l)) add(root, row);
      continue;
    }

    if (iA >= 0 && f[iA].trim() !== "T") continue;
    const p = px(f[iP]);
    if (!Number.isFinite(p) || p <= 0) continue;
    const size = iV >= 0 ? Number(f[iV]) || 0 : 0;
    const m = Math.floor(t / 60000) * 60000;
    const key = `${contract}|${m}`;
    const bar = minutes.get(key);
    if (!bar) {
      const row: Row = { t: m, o: p, h: p, l: p, c: p, v: size, contract };
      minutes.set(key, row);
      add(root, row);
    } else {
      // Lines come in time order: the last one read is the close.
      if (p > bar.h) bar.h = p;
      if (p < bar.l) bar.l = p;
      bar.c = p;
      bar.v += size;
    }
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

/**
 * Several imports of one symbol, as one history — a day's file after another,
 * or a new file over an old import. Where they overlap, the later one wins.
 */
export function mergeDatasets(list: Dataset[]): Dataset {
  const rows: { t: number; o: number; h: number; l: number; c: number; k: number }[] = [];
  list.forEach((d, k) => {
    for (let i = 0; i < d.n; i++) rows.push({ t: d.t[i], o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i], k });
  });
  rows.sort((a, b) => a.t - b.t || a.k - b.k);
  return toDataset(list[list.length - 1].symbol, rows);
}
