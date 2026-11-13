import { trailingDrawdown, type PathTrade } from "./engine";

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
  dailyStop: number | null;
  /** The prop firm's intraday trailing drawdown, for the whole account. */
  ddLimit?: number | null;
  /** How many pairs share that account, and how much of the limit is kept in reserve. */
  pairs?: number;
  safety?: number;
};

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
  winRate: number;
  pf: number | null;
  lastLots: number;
};

const chicagoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });

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

export function runAccount(trades: AccountTrade[], fixedLots: number | ((tr: AccountTrade) => number), rules: AccountRules): AccountRun {
  const sorted = [...trades].sort((a, b) => a.t - b.t);
  let eq = 0, peak = 0, maxDD = 0, win = 0, loss = 0, wins = 0, n = 0, skipped = 0, lastLots = 0;
  const dayPnl = new Map<string, number>();
  const stopped = new Set<string>();
  const paths: PathTrade[] = [];
  for (const tr of sorted) {
    const day = chicagoDay.format(tr.t);
    if (stopped.has(day)) {
      skipped++;
      continue;
    }
    // The tier is decided by where the account stood before the trade.
    let lots = typeof fixedLots === "function" ? fixedLots(tr) : fixedLots;
    if (rules.tiers?.length) {
      lots = rules.tiers[0].lots;
      for (const t of rules.tiers) if (eq >= t.from) lots = t.lots;
    }
    lastLots = lots;
    const money = tr.tickValue * lots;
    const p = tr.ticks * money;
    n++;
    eq += p;
    if (p > 0) {
      win += p;
      wins++;
    } else loss -= p;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    paths.push({
      start: tr.t,
      end: tr.end ?? tr.t,
      final: p,
      mfe: Math.max(0, (tr.mfe ?? tr.ticks) * money),
      mae: Math.min(0, (tr.mae ?? tr.ticks) * money),
      give: Math.max(0, (tr.give ?? Math.max(0, -tr.ticks)) * money),
    });
    const d = (dayPnl.get(day) ?? 0) + p;
    dayPnl.set(day, d);
    if (rules.dailyStop !== null && d <= -rules.dailyStop) stopped.add(day);
  }
  const prop = trailingDrawdown(paths, rules.ddLimit ?? null);
  return {
    n,
    skipped,
    stopDays: stopped.size,
    pnl: eq,
    maxDD,
    propDD: prop.dd,
    breachAt: prop.breachAt,
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
export function bestPlan(symbols: PlanSymbol[], ddLimit: number, dailyStop: number | null, perSymbol = 8): Plan | null {
  if (!symbols.length) return null;
  type Opt = { key: string | null; lots: number; trades: AccountTrade[] };
  const options: Opt[][] = symbols.map((s) => [
    { key: null, lots: 0, trades: [] },
    ...s.configs.slice(0, perSymbol).flatMap((c) => PLAN_LOTS.map((lots) => ({ key: c.key, lots, trades: c.trades }))),
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
    return runAccount(trades, (t) => lotsOf.get(t) ?? 0, { tiers: null, dailyStop, ddLimit });
  };
  let best: { pick: number[]; run: AccountRun } | null = null;
  let searched = 0;
  const consider = (pick: number[]) => {
    searched++;
    const run = evaluate(pick);
    if (run.propDD >= ddLimit) return;
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
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < options.length; i++) {
          let bestHere = pick[i];
          let bestPnl = -Infinity;
          for (let o = 0; o < options[i].length; o++) {
            pick[i] = o;
            searched++;
            const run = evaluate(pick);
            if (run.propDD < ddLimit && run.pnl > bestPnl) {
              bestPnl = run.pnl;
              bestHere = o;
            }
          }
          if (pick[i] !== bestHere) improved = true;
          pick[i] = bestHere;
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
