import type { Bars } from "./parse";

/**
 * Trading levels against a price history, every configuration at once.
 *
 * A level is traded on its return: once price has moved away from it by the
 * re-arm distance, the next time it comes back is a touch. Price coming down
 * onto it is a long, price coming up onto it a short — the level as support
 * or resistance. Each configuration is a limit order placed some ticks before
 * or beyond the level, a stop, and two targets: half the position comes off at
 * TP1 and the stop goes to the entry, the other half at TP2. TP1 equal to TP2
 * is a single target.
 *
 * One-minute bars do not say what happened inside the minute, so every doubt
 * is settled against the trade: a bar that reaches both the stop and a target
 * is a stop, and the bar that fills the order can stop it out but cannot pay
 * a target.
 */

export type Config = { offset: number; sl: number; tp1: number; tp2: number };
export type Grid = { offsets: number[]; sls: number[]; tp1s: number[]; tp2s: number[] };
export type Settings = { lots: number; rearm: number; maxHours: number; minTrades: number };

export type Outcome = "SL" | "TP1" | "TP2" | "TO";
/** One simulated trade: when it was filled, which level, how many ticks it made per contract. */
export type Trade = { t: number; zone: number; dir: 1 | -1; ticks: number; out: Outcome };

type Touch = { start: number; end: number; dir: 1 | -1; zone: number };

export const configKey = (c: Config) => `${c.offset}|${c.sl}|${c.tp1}|${c.tp2}`;

/** Every time price came back to a level, and from which side. */
export function findTouches(b: Bars, level: number, tick: number, rearmTicks: number, maxOffset: number): Touch[] {
  const out: Touch[] = [];
  const eps = tick * 1e-3;
  const rearm = rearmTicks * tick;
  // The earliest any configuration can be filled: the largest offset before the level.
  const reach = Math.max(0, maxOffset) * tick;
  let armed: 0 | 1 | -1 = 0;
  let open: Touch | null = null;
  const n = b.t.length;
  for (let i = 0; i < n; i++) {
    const lo = b.l[i];
    const hi = b.h[i];
    const side: 0 | 1 | -1 = lo >= level + rearm - eps ? 1 : hi <= level - rearm + eps ? -1 : 0;
    if (side) {
      // Away again: the touch before, if any, is over.
      if (open) {
        open.end = i;
        out.push(open);
        open = null;
      }
      armed = side;
      continue;
    }
    if (armed && !open) {
      const touched = armed === 1 ? lo <= level + reach + eps : hi >= level - reach - eps;
      if (touched) {
        open = { start: i, end: n, dir: armed, zone: level };
        armed = 0;
      }
    }
  }
  if (open) out.push(open);
  return out;
}

export function simulate(b: Bars, touch: Touch, cfg: Config, tick: number, maxHours: number): Trade | null {
  const eps = tick * 1e-3;
  const d = touch.dir;
  const entry = touch.zone + d * cfg.offset * tick;
  let fill = -1;
  for (let i = touch.start; i < touch.end; i++) {
    if (d === 1 ? b.l[i] <= entry + eps : b.h[i] >= entry - eps) {
      fill = i;
      break;
    }
  }
  if (fill < 0) return null;

  const sl = entry - d * cfg.sl * tick;
  const tp1 = entry + d * cfg.tp1 * tick;
  const tp2 = entry + d * cfg.tp2 * tick;
  const against = (j: number, p: number) => (d === 1 ? b.l[j] <= p + eps : b.h[j] >= p - eps);
  const towards = (j: number, p: number) => (d === 1 ? b.h[j] >= p - eps : b.l[j] <= p + eps);
  const trade = (ticks: number, out: Outcome): Trade => ({ t: b.t[fill], zone: touch.zone, dir: d, ticks: Math.round(ticks * 10) / 10, out });

  if (against(fill, sl)) return trade(-cfg.sl, "SL");

  const limit = b.t[fill] + maxHours * 3600000;
  const n = b.t.length;
  let j = fill + 1;
  for (; j < n && b.t[j] <= limit; j++) {
    if (against(j, sl)) return trade(-cfg.sl, "SL");
    if (towards(j, tp1)) {
      if (towards(j, tp2)) return trade((cfg.tp1 + cfg.tp2) / 2, "TP2");
      for (let k = j + 1; k < n && b.t[k] <= limit; k++) {
        if (against(k, entry)) return trade(cfg.tp1 / 2, "TP1");
        if (towards(k, tp2)) return trade((cfg.tp1 + cfg.tp2) / 2, "TP2");
      }
      // Out of time with half on: the rest closes where the clock ran out.
      const k = lastBefore(b, limit);
      return trade((cfg.tp1 + (d * (b.c[k] - entry)) / tick) / 2, "TO");
    }
  }
  const k = lastBefore(b, limit);
  return trade((d * (b.c[k] - entry)) / tick, "TO");
}

function lastBefore(b: Bars, limit: number) {
  let lo = 0;
  let hi = b.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (b.t[mid] <= limit) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ---------------------------------------------------------------------------

export type Bucket = { n: number; wins: number; pnl: number };

export type ConfigStats = {
  key: string;
  cfg: Config;
  n: number;
  tp2: number;
  tp1: number;
  sl: number;
  to: number;
  netTicks: number;
  pnl: number;
  pf: number | null;
  maxDD: number;
  winRate: number;
  months: Record<string, Bucket>;
  zones: Record<string, Bucket>;
  /** [minutes since epoch, ticks], in order: enough to redraw the curve and combine symbols. */
  trades: [number, number][];
};

export type Best = { value: string; key: string; n: number; winRate: number; pnl: number; pf: number | null };

export type SymbolResult = {
  symbol: string;
  ranAt: number;
  from: number;
  to: number;
  bars: number;
  touches: number;
  tickValue: number;
  settings: Settings;
  zones: number[];
  tested: number;
  top: ConfigStats[];
  byOffset: Best[];
  bySl: Best[];
  byTp: Best[];
};

export const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);

function statsOf(cfg: Config, trades: Trade[], tickValue: number, lots: number, keepDetail: boolean): ConfigStats {
  trades.sort((a, b) => a.t - b.t);
  let tp2 = 0, tp1 = 0, sl = 0, to = 0, netTicks = 0, win = 0, loss = 0, peak = 0, eq = 0, maxDD = 0, wins = 0;
  const months: Record<string, Bucket> = {};
  const zones: Record<string, Bucket> = {};
  const money = tickValue * lots;
  for (const tr of trades) {
    if (tr.out === "TP2") tp2++;
    else if (tr.out === "TP1") tp1++;
    else if (tr.out === "SL") sl++;
    else to++;
    const p = tr.ticks * money;
    const won = tr.ticks > 0;
    if (won) wins++;
    netTicks += tr.ticks;
    if (p > 0) win += p;
    else loss -= p;
    eq += p;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    if (keepDetail) {
      const m = (months[monthOf(tr.t)] ??= { n: 0, wins: 0, pnl: 0 });
      m.n++;
      m.pnl += p;
      if (won) m.wins++;
      const z = (zones[String(tr.zone)] ??= { n: 0, wins: 0, pnl: 0 });
      z.n++;
      z.pnl += p;
      if (won) z.wins++;
    }
  }
  return {
    key: configKey(cfg),
    cfg,
    n: trades.length,
    tp2,
    tp1,
    sl,
    to,
    netTicks: Math.round(netTicks * 10) / 10,
    pnl: netTicks * money,
    pf: loss > 0 ? win / loss : win > 0 ? null : 0,
    maxDD,
    winRate: trades.length ? wins / trades.length : 0,
    months,
    zones,
    trades: keepDetail ? trades.map((t) => [Math.round(t.t / 60000), t.ticks]) : [],
  };
}

export function configsOf(g: Grid): Config[] {
  const out: Config[] = [];
  for (const offset of g.offsets)
    for (const sl of g.sls)
      for (const tp1 of g.tp1s)
        for (const tp2 of g.tp2s) if (tp2 >= tp1) out.push({ offset, sl, tp1, tp2 });
  return out;
}

/**
 * Runs the whole grid on one symbol.
 *
 * Yields to the page every few configurations so the progress bar moves and
 * the tab does not freeze on a year of bars.
 */
export async function analyse(
  symbol: string,
  b: Bars & { from: number; to: number; n: number },
  zones: number[],
  tick: number,
  tickValue: number,
  grid: Grid,
  settings: Settings,
  onProgress: (done: number, total: number) => void
): Promise<SymbolResult> {
  const maxOffset = Math.max(...grid.offsets, 0);
  const touches = zones.flatMap((z) => findTouches(b, z, tick, settings.rearm, maxOffset)).sort((a, c) => a.start - c.start);
  const configs = configsOf(grid);
  const all: { cfg: Config; trades: Trade[]; s: ConfigStats }[] = [];

  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    const trades: Trade[] = [];
    for (const touch of touches) {
      const tr = simulate(b, touch, cfg, tick, settings.maxHours);
      if (tr) trades.push(tr);
    }
    all.push({ cfg, trades, s: statsOf(cfg, trades, tickValue, settings.lots, false) });
    if (i % 10 === 9) {
      onProgress(i + 1, configs.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress(configs.length, configs.length);

  // A configuration that traded three times and won three times is luck, not
  // a result: ranked only among those with enough trades, if any have.
  const enough = all.filter((x) => x.s.n >= settings.minTrades);
  const pool = enough.length ? enough : all;
  pool.sort((a, c) => c.s.pnl - a.s.pnl);

  const best = (pick: (c: Config) => string): Best[] => {
    const m = new Map<string, (typeof pool)[number]>();
    for (const x of pool) if (!m.has(pick(x.cfg))) m.set(pick(x.cfg), x);
    return [...m.entries()].map(([value, x]) => ({ value, key: x.s.key, n: x.s.n, winRate: x.s.winRate, pnl: x.s.pnl, pf: x.s.pf }));
  };
  const num = (a: Best, c: Best) => Number(a.value) - Number(c.value);

  return {
    symbol,
    ranAt: Date.now(),
    from: b.from,
    to: b.to,
    bars: b.n,
    touches: touches.length,
    tickValue,
    settings,
    zones,
    tested: configs.length,
    top: pool.slice(0, 20).map((x) => statsOf(x.cfg, x.trades, tickValue, settings.lots, true)),
    byOffset: best((c) => String(c.offset)).sort(num),
    bySl: best((c) => String(c.sl)).sort(num),
    byTp: best((c) => `${c.tp1}/${c.tp2}`).sort((a, c) => {
      const [a1, a2] = a.value.split("/").map(Number);
      const [c1, c2] = c.value.split("/").map(Number);
      return a1 - c1 || a2 - c2;
    }),
  };
}
