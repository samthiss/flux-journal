import { sessionDay, trailingDrawdown, type DDMode, type PathTrade } from "./engine";

/**
 * The account rules, played over the trades of every symbol in time order.
 *
 * Size by tiers — one lot, then more once the account is far enough up — a
 * daily stop that ends the day across all markets once its losses reach a
 * figure, and the prop firm's intraday trailing drawdown. All three depend on
 * what came before across the whole account, so they cannot be read off one
 * symbol: they are applied here, to the combined sequence, after the search.
 */

export type Tier = { from: number; lots: number };
export type AccountRules = {
  tiers: Tier[] | null;
  /** The prop firm's daily loss limit, open losses included: reaching it ends the session, not the account. */
  dailyStop: number | null;
  /** The prop firm's intraday trailing drawdown, for the whole account: reaching it loses the account. */
  ddLimit?: number | null;
  /** How many pairs share that account, and how much of the limit is kept in reserve. */
  pairs?: number;
  safety?: number;
  /** How the drawdown trails: from every high, or from each session's close. */
  ddMode?: DDMode;
  /** The profit the evaluation asks for. */
  target?: number | null;
  /** The most contracts the firm allows open at once, all pairs together. */
  maxContracts?: number | null;
  /** The most one trade may lose, stop hit: sizes that would risk more are not offered. */
  maxLossPerTrade?: number | null;
};

/** The stop of a configuration, in ticks, read off its key ("kind|offset|sl|…"). */
export const stopOfKey = (key: string) => Number(key.split("|")[2]);

/** One pair's share of the drawdown: the limit, less the reserve, split between the pairs. */
export const pairBudget = (a: AccountRules) => (a.ddLimit ? (a.ddLimit * (1 - (a.safety ?? 0) / 100)) / Math.max(1, a.pairs ?? 1) : null);

export const DEFAULT_TIERS: Tier[] = [
  { from: 0, lots: 1 },
  { from: 1000, lots: 1.5 },
  { from: 2000, lots: 2 },
];

/**
 * One trade as the report keeps it, with the value of a tick on its contract.
 * The path — close, best, worst, given back — is missing on results saved
 * before the drawdown was counted open; the trade then counts as closed.
 */
export type AccountTrade = { t: number; ticks: number; tickValue: number; end?: number; mfe?: number; mae?: number; give?: number };
export type AccountRun = {
  n: number;
  skipped: number;
  stopDays: number;
  pnl: number;
  maxDD: number;
  /** Intraday trailing, open profit included. */
  propDD: number;
  /** When the prop limit was first reached, if it was. */
  breachAt: number | null;
  /** When the profit target was first reached, if it was, and on how many sessions traded until then. */
  targetAt: number | null;
  targetSessions: number | null;
  /** The most contracts open at once, all pairs together. */
  maxOpen: number;
  /** The worst any session went, open losses included: what the daily limit is measured against. */
  worstDay: number;
  winRate: number;
  pf: number | null;
  lastLots: number;
};

/** A trade's CME session. */
const dayOf = (tr: AccountTrade) => sessionDay(tr.t);

/** "0:1, 1000:1.5, 2000:2" ↔ tiers. */
export const tiersText = (tiers: Tier[]) => tiers.map((t) => `${t.from}:${t.lots}`).join(", ");
export function parseTiers(text: string): Tier[] {
  return text
    .split(/[,;]+/)
    .map((p) => p.split(":").map((x) => Number(x.trim().replace(",", "."))))
    .filter(([from, lots]) => Number.isFinite(from) && Number.isFinite(lots) && lots > 0)
    .map(([from, lots]) => ({ from, lots }))
    .sort((a, b) => a.from - b.from);
}

/** A stored trade row back into an account trade. */
export function fromRow(row: number[], tickValue: number): AccountTrade {
  const [m, ticks, end, mfe, mae, give] = row;
  return end === undefined
    ? { t: m * 60000, ticks, tickValue }
    : { t: m * 60000, ticks, tickValue, end: end * 60000, mfe, mae, give };
}

/**
 * The account, trade by trade.
 *
 * The daily limit is the prop firm's: losses of the session, open ones
 * included, may not reach it. Positions open at the same time are taken
 * together, their worst moments as if they came at once; when that worst
 * would cross the limit, the firm closes them there — the day loses exactly
 * the limit — and nothing more is traded until the next session.
 */
export function runAccount(trades: AccountTrade[], fixedLots: number | ((tr: AccountTrade) => number), rules: AccountRules): AccountRun {
  const sorted = [...trades].sort((a, b) => a.t - b.t);
  let eq = 0, peak = 0, maxDD = 0, win = 0, loss = 0, wins = 0, n = 0, skipped = 0, lastLots = 0;
  const dayPnl = new Map<number, number>();
  const stopped = new Set<number>();
  const paths: PathTrade[] = [];
  const sessions = new Set<number>();
  let maxOpen = 0;
  let worstDay = 0;
  let targetAt: number | null = null;
  let targetSessions: number | null = null;
  for (let i = 0; i < sorted.length; ) {
    // The positions open together with this one.
    let k = i + 1;
    let end = sorted[i].end ?? sorted[i].t;
    while (k < sorted.length && sorted[k].t <= end) {
      end = Math.max(end, sorted[k].end ?? sorted[k].t);
      k++;
    }
    const group = sorted.slice(i, k);
    i = k;
    const day = dayOf(group[0]);
    if (stopped.has(day)) {
      skipped += group.length;
      continue;
    }
    // The tier is decided by where the account stood before the trades.
    let final = 0, mfe = 0, mae = 0, give = 0, open = 0;
    const results: number[] = [];
    for (const tr of group) {
      let lots = typeof fixedLots === "function" ? fixedLots(tr) : fixedLots;
      if (rules.tiers?.length) {
        lots = rules.tiers[0].lots;
        for (const t of rules.tiers) if (eq >= t.from) lots = t.lots;
      }
      lastLots = lots;
      open += lots;
      const money = tr.tickValue * lots;
      const p = tr.ticks * money;
      results.push(p);
      final += p;
      mfe += Math.max(0, (tr.mfe ?? tr.ticks) * money);
      mae += Math.min(0, (tr.mae ?? tr.ticks) * money);
      give += Math.max(0, (tr.give ?? Math.max(0, -tr.ticks)) * money);
    }
    const before = dayPnl.get(day) ?? 0;
    let liquidated = false;
    if (rules.dailyStop !== null && before + mae <= -rules.dailyStop) {
      // Closed by the firm at the limit.
      liquidated = true;
      final = -rules.dailyStop - before;
      // Nothing worse than the limit was lived through: the position was gone there.
      mae = Math.min(0, final);
      give = Math.max(0, mfe - final);
      stopped.add(day);
    }
    n += group.length;
    sessions.add(day);
    worstDay = Math.min(worstDay, before + mae);
    // Positions taken together are counted as open together: an upper bound.
    maxOpen = Math.max(maxOpen, open);
    if (liquidated) loss -= final;
    else
      for (const p of results) {
        if (p > 0) {
          win += p;
          wins++;
        } else loss -= p;
      }
    eq += final;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    if (targetAt === null && rules.target && eq >= rules.target) {
      targetAt = end;
      targetSessions = sessions.size;
    }
    paths.push({ start: group[0].t, end, final, mfe, mae, give });
    const d = before + final;
    dayPnl.set(day, d);
    if (rules.dailyStop !== null && d <= -rules.dailyStop) stopped.add(day);
  }
  const prop = trailingDrawdown(paths, rules.ddLimit ?? null, rules.ddMode ?? "intraday");
  return {
    n,
    skipped,
    stopDays: stopped.size,
    pnl: eq,
    maxDD,
    propDD: prop.dd,
    breachAt: prop.breachAt,
    targetAt,
    targetSessions,
    maxOpen,
    worstDay,
    winRate: n ? wins / n : 0,
    pf: loss > 0 ? win / loss : win > 0 ? null : 0,
    lastLots,
  };
}

// ---------------------------------------------------------------------------

/** What the plan can choose from, for one symbol: its best configurations and their trades. */
export type PlanSymbol = { symbol: string; tickValue: number; configs: { key: string; trades: AccountTrade[] }[] };
export type PlanChoice = { symbol: string; key: string | null; lots: number };
export type Plan = { choices: PlanChoice[]; run: AccountRun; searched: number };

/** 0.5 is five micros. */
export const PLAN_LOTS = [0.5, 1, 1.5, 2, 3];

/**
 * The most the account could have made without ever reaching the prop
 * firm's drawdown: one configuration and one size per symbol, or the symbol
 * left out.
 *
 * Every combination is tried while there are few enough; past that, one
 * symbol at a time is improved until nothing improves, from several starts.
 */
export function bestPlan(symbols: PlanSymbol[], ddLimit: number, rules: AccountRules, perSymbol = 8): Plan | null {
  const limits = { ...rules, tiers: null, ddLimit };
  if (!symbols.length) return null;
  type Opt = { key: string | null; lots: number; trades: AccountTrade[] };
  const options: Opt[][] = symbols.map((s) => [
    { key: null, lots: 0, trades: [] },
    ...s.configs.slice(0, perSymbol).flatMap((c) =>
      PLAN_LOTS.filter((lots) => !rules.maxLossPerTrade || stopOfKey(c.key) * s.tickValue * lots <= rules.maxLossPerTrade + 1e-9).map((lots) => ({
        key: c.key,
        lots,
        trades: c.trades,
      }))
    ),
  ]);
  const evaluate = (pick: number[]) => {
    const trades: AccountTrade[] = [];
    const lotsOf = new Map<AccountTrade, number>();
    pick.forEach((o, i) => {
      for (const t of options[i][o].trades) {
        trades.push(t);
        lotsOf.set(t, options[i][o].lots);
      }
    });
    return runAccount(trades, (t) => lotsOf.get(t) ?? 0, limits);
  };
  // Under the drawdown, and never more contracts open than the firm allows.
  const allowed = (run: AccountRun) => run.propDD < ddLimit && (!rules.maxContracts || run.maxOpen <= rules.maxContracts);
  let best: { pick: number[]; run: AccountRun } | null = null;
  let searched = 0;
  const consider = (pick: number[]) => {
    searched++;
    const run = evaluate(pick);
    if (!allowed(run)) return;
    if (!best || run.pnl > best.run.pnl) best = { pick: [...pick], run };
  };

  const total = options.reduce((a, o) => a * o.length, 1);
  if (total <= 20000) {
    const pick = options.map(() => 0);
    for (;;) {
      consider(pick);
      let i = 0;
      while (i < pick.length && ++pick[i] === options[i].length) pick[i++] = 0;
      if (i === pick.length) break;
    }
  } else {
    // Coordinate ascent, from nothing and from each symbol's best at each size.
    const starts = [options.map(() => 0), ...PLAN_LOTS.map((_, k) => options.map(() => 1 + k))];
    for (const start of starts) {
      const pick = [...start];
      // A move is taken only when it makes strictly more: two choices worth the
      // same would otherwise be swapped back and forth for ever.
      const score = () => {
        const run = evaluate(pick);
        return allowed(run) ? run.pnl : -Infinity;
      };
      let current = score();
      let improved = true;
      for (let pass = 0; improved && pass < 50; pass++) {
        improved = false;
        for (let i = 0; i < options.length; i++) {
          const was = pick[i];
          let bestHere = was;
          let bestPnl = current;
          for (let o = 0; o < options[i].length; o++) {
            if (o === was) continue;
            pick[i] = o;
            searched++;
            const v = score();
            if (v > bestPnl + 0.01) {
              bestPnl = v;
              bestHere = o;
            }
          }
          pick[i] = bestHere;
          if (bestHere !== was) {
            improved = true;
            current = bestPnl;
          }
        }
      }
      consider(pick);
    }
  }
  const found = best as { pick: number[]; run: AccountRun } | null;
  if (!found) return null;
  return {
    choices: found.pick.map((o, i) => ({ symbol: symbols[i].symbol, key: options[i][o].key, lots: options[i][o].lots })),
    run: found.run,
    searched,
  };
}
