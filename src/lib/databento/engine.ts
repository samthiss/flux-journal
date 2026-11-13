import type { Bars } from "./parse";

/**
 * Trading levels against a price history, every configuration at once.
 *
 * A level is traded on its return: once price has moved away from it by the
 * re-arm distance, the next time it comes back is a touch. Price coming down
 * onto it is a long, price coming up onto it a short — the level as support
 * or resistance. Each configuration is a limit order placed some ticks before
 * or beyond the level, a stop, and one of three ways out:
 *
 * - "fixed": half the position comes off at TP1 and the stop goes to the
 *   entry, the other half at TP2. TP1 equal to TP2 is a single target.
 * - "trail": no target. Once the trade is `act` ticks in profit, the stop
 *   follows the best price at `dist` ticks.
 * - "tp1trail": half off at TP1 with the stop to the entry, and the other half
 *   trailed as above.
 *
 * One-minute bars do not say what happened inside the minute, so every doubt
 * is settled against the trade: a bar that reaches both the stop and a target
 * is a stop, the bar that fills the order can stop it out but cannot pay a
 * target, and a trailing stop raised by a bar only protects from the next one.
 */

export type ExitKind = "fixed" | "trail" | "tp1trail";
export type Config = { kind: ExitKind; offset: number; sl: number; tp1: number; tp2: number; act: number; dist: number };
export type Grid = {
  offsets: number[];
  sls: number[];
  tp1s: number[];
  tp2s: number[];
  acts: number[];
  dists: number[];
  kinds: ExitKind[];
};
export type Settings = { lots: number; rearm: number; maxHours: number; minTrades: number };

export type Outcome = "SL" | "TP1" | "TP2" | "TR" | "TO";
/** One simulated trade: when it was filled, which level, how many ticks it made per contract. */
export type Trade = { t: number; zone: number; dir: 1 | -1; ticks: number; out: Outcome };

type Touch = { start: number; end: number; dir: 1 | -1; zone: number };

export const EXIT_LABELS: Record<ExitKind, string> = {
  fixed: "TP1/TP2 fixes",
  trail: "Trailing",
  tp1trail: "TP1 + trailing",
};

/** Results saved before the trailing stop existed carry no kind: they were fixed targets. */
export const kindOf = (c: Partial<Config>): ExitKind => c.kind ?? "fixed";

export const configKey = (c: Config) => `${c.kind}|${c.offset}|${c.sl}|${c.tp1}|${c.tp2}|${c.act}|${c.dist}`;

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
  const ticksAt = (p: number) => (d * (p - entry)) / tick;

  if (against(fill, sl)) return trade(-cfg.sl, "SL");

  const limit = b.t[fill] + maxHours * 3600000;
  const n = b.t.length;
  const kind = kindOf(cfg);

  if (kind === "fixed") {
    for (let j = fill + 1; j < n && b.t[j] <= limit; j++) {
      if (against(j, sl)) return trade(-cfg.sl, "SL");
      if (towards(j, tp1)) {
        if (towards(j, tp2)) return trade((cfg.tp1 + cfg.tp2) / 2, "TP2");
        for (let k = j + 1; k < n && b.t[k] <= limit; k++) {
          if (against(k, entry)) return trade(cfg.tp1 / 2, "TP1");
          if (towards(k, tp2)) return trade((cfg.tp1 + cfg.tp2) / 2, "TP2");
        }
        // Out of time with half on: the rest closes where the clock ran out.
        return trade((cfg.tp1 + ticksAt(b.c[lastBefore(b, limit)])) / 2, "TO");
      }
    }
    return trade(ticksAt(b.c[lastBefore(b, limit)]), "TO");
  }

  // Trailing: the whole position, or the half left after TP1.
  const half = kind === "tp1trail";
  let stop = sl;
  let best = entry;
  let tp1Done = false;
  let trailed = false;
  for (let j = fill + 1; j < n && b.t[j] <= limit; j++) {
    // The stop as it stood when the bar opened.
    if (against(j, stop)) {
      if (half && !tp1Done) return trade(-cfg.sl, "SL");
      const runner = ticksAt(stop);
      const out: Outcome = trailed ? "TR" : half ? "TP1" : "SL";
      return trade(half ? (cfg.tp1 + runner) / 2 : runner, out);
    }
    if (half && !tp1Done && towards(j, tp1)) {
      tp1Done = true;
      if (d * (entry - stop) > 0) stop = entry;
    }
    const fav = d === 1 ? b.h[j] : b.l[j];
    if (d * (fav - best) > 0) best = fav;
    if ((!half || tp1Done) && ticksAt(best) >= cfg.act - 1e-9) {
      const cand = best - d * cfg.dist * tick;
      if (d * (cand - stop) > 0) {
        stop = cand;
        trailed = true;
      }
    }
  }
  const close = ticksAt(b.c[lastBefore(b, limit)]);
  return trade(half ? (tp1Done ? (cfg.tp1 + close) / 2 : close) : close, "TO");
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
  tr?: number;
  to: number;
  netTicks: number;
  pnl: number;
  pf: number | null;
  maxDD: number;
  winRate: number;
  months: Record<string, Bucket>;
  zones: Record<string, Bucket>;
  /** "long" / "short". */
  dirs?: Record<string, Bucket>;
  /** Hour of the fill, Paris time, "0" to "23". */
  hours?: Record<string, Bucket>;
  /** [minutes since epoch, ticks], in order: enough to redraw the curve and combine symbols. */
  trades: [number, number][];
};

export type Best = { value: string; key: string; n: number; winRate: number; pnl: number; pf: number | null };

/**
 * The honest version of "the best configuration": chosen on the first two
 * thirds of the history, then judged on the last third it never saw.
 */
export type Validation = { split: number; key: string; cfg: Config; inN: number; inPnl: number; outN: number; outPnl: number; outWin: number };

/** How the configurations one step away from the best one did. */
export type Neighbours = { n: number; positive: number; avgPnl: number };

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
  byExit?: Best[];
  byTrail?: Best[];
  validation?: Validation | null;
  neighbours?: Neighbours | null;
};

export const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);

const parisClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" });
/** The hour of a moment in Paris, 0 to 23. */
const parisHour = (t: number) => Number(parisClock.formatToParts(t).find((p) => p.type === "hour")?.value ?? 0);

function bump(map: Record<string, Bucket>, key: string, p: number, won: boolean) {
  const b = (map[key] ??= { n: 0, wins: 0, pnl: 0 });
  b.n++;
  b.pnl += p;
  if (won) b.wins++;
}

function statsOf(cfg: Config, trades: Trade[], tickValue: number, lots: number, keepDetail: boolean): ConfigStats {
  trades.sort((a, b) => a.t - b.t);
  let tp2 = 0, tp1 = 0, sl = 0, tr = 0, to = 0, netTicks = 0, win = 0, loss = 0, peak = 0, eq = 0, maxDD = 0, wins = 0;
  const months: Record<string, Bucket> = {};
  const zones: Record<string, Bucket> = {};
  const dirs: Record<string, Bucket> = {};
  const hours: Record<string, Bucket> = {};
  const money = tickValue * lots;
  for (const t of trades) {
    if (t.out === "TP2") tp2++;
    else if (t.out === "TP1") tp1++;
    else if (t.out === "SL") sl++;
    else if (t.out === "TR") tr++;
    else to++;
    const p = t.ticks * money;
    const won = t.ticks > 0;
    if (won) wins++;
    netTicks += t.ticks;
    if (p > 0) win += p;
    else loss -= p;
    eq += p;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    if (keepDetail) {
      bump(months, monthOf(t.t), p, won);
      bump(zones, String(t.zone), p, won);
      bump(dirs, t.dir === 1 ? "long" : "short", p, won);
      bump(hours, String(parisHour(t.t)), p, won);
    }
  }
  return {
    key: configKey(cfg),
    cfg,
    n: trades.length,
    tp2,
    tp1,
    sl,
    tr,
    to,
    netTicks: Math.round(netTicks * 10) / 10,
    pnl: netTicks * money,
    pf: loss > 0 ? win / loss : win > 0 ? null : 0,
    maxDD,
    winRate: trades.length ? wins / trades.length : 0,
    months,
    zones,
    dirs,
    hours,
    trades: keepDetail ? trades.map((t) => [Math.round(t.t / 60000), t.ticks]) : [],
  };
}

export function configsOf(g: Grid): Config[] {
  const out: Config[] = [];
  const kinds = g.kinds?.length ? g.kinds : (["fixed"] as ExitKind[]);
  for (const offset of g.offsets)
    for (const sl of g.sls) {
      if (kinds.includes("fixed"))
        for (const tp1 of g.tp1s) for (const tp2 of g.tp2s) if (tp2 >= tp1) out.push({ kind: "fixed", offset, sl, tp1, tp2, act: 0, dist: 0 });
      // A trail wider than its trigger would put the stop back under the
      // entry the moment it starts: those are left out.
      for (const act of g.acts ?? [])
        for (const dist of g.dists ?? []) {
          if (dist > act || dist <= 0) continue;
          if (kinds.includes("trail")) out.push({ kind: "trail", offset, sl, tp1: 0, tp2: 0, act, dist });
          if (kinds.includes("tp1trail")) for (const tp1 of g.tp1s) out.push({ kind: "tp1trail", offset, sl, tp1, tp2: 0, act, dist });
        }
    }
  return out;
}

/** The configurations one step away in a single setting, on the grid that was tested. */
function neighboursOf(c: Config, g: Grid): string[] {
  const step = (list: number[] | undefined, v: number) => {
    const s = [...new Set(list ?? [])].sort((a, b) => a - b);
    const i = s.indexOf(v);
    return [s[i - 1], s[i + 1]].filter((x) => x !== undefined);
  };
  const out: Config[] = [];
  for (const offset of step(g.offsets, c.offset)) out.push({ ...c, offset });
  for (const sl of step(g.sls, c.sl)) out.push({ ...c, sl });
  if (c.kind !== "trail") for (const tp1 of step(g.tp1s, c.tp1)) out.push({ ...c, tp1 });
  if (c.kind === "fixed") for (const tp2 of step(g.tp2s, c.tp2)) out.push({ ...c, tp2 });
  if (c.kind !== "fixed") {
    for (const act of step(g.acts, c.act)) out.push({ ...c, act });
    for (const dist of step(g.dists, c.dist)) out.push({ ...c, dist });
  }
  return out.map(configKey);
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
    if (i % 20 === 19) {
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

  const best = (rows: typeof pool, pick: (c: Config) => string | null): Best[] => {
    const m = new Map<string, (typeof pool)[number]>();
    for (const x of rows) {
      const v = pick(x.cfg);
      if (v !== null && !m.has(v)) m.set(v, x);
    }
    return [...m.entries()].map(([value, x]) => ({ value, key: x.s.key, n: x.s.n, winRate: x.s.winRate, pnl: x.s.pnl, pf: x.s.pf }));
  };
  const num = (a: Best, c: Best) => Number(a.value) - Number(c.value);
  const pair = (a: Best, c: Best) => {
    const [a1, a2] = a.value.split("/").map(Number);
    const [c1, c2] = c.value.split("/").map(Number);
    return a1 - c1 || a2 - c2;
  };

  // Out of sample: chosen on the first two thirds, judged on the last.
  const split = b.from + ((b.to - b.from) * 2) / 3;
  let validation: Validation | null = null;
  {
    const scored = all.map((x) => {
      let inN = 0, inT = 0, outN = 0, outT = 0, outW = 0;
      for (const t of x.trades) {
        if (t.t < split) {
          inN++;
          inT += t.ticks;
        } else {
          outN++;
          outT += t.ticks;
          if (t.ticks > 0) outW++;
        }
      }
      return { x, inN, inT, outN, outT, outW };
    });
    const minIn = Math.max(1, Math.round((settings.minTrades * 2) / 3));
    const ok = scored.filter((s) => s.inN >= minIn);
    const pick = (ok.length ? ok : scored).reduce<(typeof scored)[number] | null>((a, s) => (!a || s.inT > a.inT ? s : a), null);
    if (pick) {
      const money = tickValue * settings.lots;
      validation = {
        split,
        key: pick.x.s.key,
        cfg: pick.x.cfg,
        inN: pick.inN,
        inPnl: pick.inT * money,
        outN: pick.outN,
        outPnl: pick.outT * money,
        outWin: pick.outN ? pick.outW / pick.outN : 0,
      };
    }
  }

  let neighbours: Neighbours | null = null;
  if (pool.length) {
    const byKey = new Map(all.map((x) => [x.s.key, x.s]));
    const near = neighboursOf(pool[0].cfg, grid)
      .map((k) => byKey.get(k))
      .filter((s): s is ConfigStats => !!s);
    if (near.length)
      neighbours = { n: near.length, positive: near.filter((s) => s.pnl > 0).length, avgPnl: near.reduce((a, s) => a + s.pnl, 0) / near.length };
  }

  const fixed = pool.filter((x) => x.cfg.kind === "fixed");
  const trailing = pool.filter((x) => x.cfg.kind !== "fixed");

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
    byOffset: best(pool, (c) => String(c.offset)).sort(num),
    bySl: best(pool, (c) => String(c.sl)).sort(num),
    byTp: best(fixed, (c) => `${c.tp1}/${c.tp2}`).sort(pair),
    byExit: best(pool, (c) => c.kind),
    byTrail: best(trailing, (c) => `${c.act}/${c.dist}`).sort(pair),
    validation,
    neighbours,
  };
}
