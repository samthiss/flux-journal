export const PERIODS = ["today", "week", "month", "all", "custom"] as const;

/**
 * A custom range travels as one string, `custom:<from>:<to>`, so it fits the
 * same cookie and the same `period` state as the four fixed choices. Either
 * bound may be empty — "everything before that date" and "everything since" are
 * both useful, and a range with neither bound is simply everything.
 */
export function parseCustomPeriod(period: string): { from: string; to: string } | null {
  if (!period.startsWith("custom")) return null;
  const [, from = "", to = ""] = period.split(":");
  return { from, to };
}

export function buildCustomPeriod(from: string, to: string) {
  return `custom:${from}:${to}`;
}

/** Accepts the four fixed periods and any custom range; anything else is rejected. */
export function isValidPeriod(period: string | undefined): period is string {
  if (!period) return false;
  if (PERIODS.includes(period as (typeof PERIODS)[number])) return true;
  const custom = parseCustomPeriod(period);
  if (!custom) return false;
  const dateOrEmpty = (v: string) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);
  return dateOrEmpty(custom.from) && dateOrEmpty(custom.to);
}

export type TradeForStats = {
  id: string;
  date: Date;
  symbol: string;
  side: string;
  size: number;
  pnl: number;
  setup: string;
  market: string | null;
  rr: number | null;
};

/**
 * The columns above, as a Prisma `select`.
 *
 * The dashboard and the trades table both read a trade list and both need
 * exactly these fields. Left to `findMany` with no select, they instead carry
 * every column — the two free-text note fields and the four chart URLs
 * included, which on the current data is nine tenths of the bytes and none of
 * the information either screen draws.
 *
 * Kept beside the type so the two cannot drift: a field added here without a
 * matching line above is unused, and one added above without a line here fails
 * to typecheck where the query result is passed on.
 */
export const TRADE_FOR_STATS_SELECT = {
  id: true,
  date: true,
  symbol: true,
  side: true,
  size: true,
  pnl: true,
  setup: true,
  market: true,
  rr: true,
} as const;

export type TradeWithOutcome = TradeForStats & { outcome: "win" | "loss" };

export function withOutcome(trades: TradeForStats[]): TradeWithOutcome[] {
  return trades.map((t) => ({ ...t, outcome: t.pnl > 0 ? "win" : "loss" }));
}

export function filterByPeriod(trades: TradeWithOutcome[], period: string, referenceDate: Date) {
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  if (period === "today") {
    return trades.filter((t) => sameDay(t.date, ref));
  }
  if (period === "week") {
    const start = new Date(ref);
    start.setDate(start.getDate() - 6);
    return trades.filter((t) => t.date >= start && t.date <= endOfDay(ref));
  }
  if (period === "month") {
    return trades.filter(
      (t) => t.date.getFullYear() === ref.getFullYear() && t.date.getMonth() === ref.getMonth()
    );
  }

  const custom = parseCustomPeriod(period);
  if (custom) {
    // Both bounds are inclusive, and each is optional. The dates are parsed in
    // local time rather than through `new Date("2026-01-05")`, which reads as
    // UTC midnight and drops the first day of the range for anyone east of
    // Greenwich.
    const from = custom.from ? startOfLocalDay(custom.from) : null;
    const to = custom.to ? endOfDay(startOfLocalDay(custom.to)) : null;
    return trades.filter((t) => (!from || t.date >= from) && (!to || t.date <= to));
  }

  return trades;
}

function startOfLocalDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function endOfDay(d: Date) {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

export function computeDashboardStats(trades: TradeWithOutcome[]) {
  const hasTrades = trades.length > 0;
  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const winRate = hasTrades ? wins.length / trades.length : 0;
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const avgWin = wins.reduce((a, t) => a + t.pnl, 0) / (wins.length || 1);
  const avgLoss = losses.reduce((a, t) => a + t.pnl, 0) / (losses.length || 1);
  const grossLoss = losses.reduce((a, t) => a + t.pnl, 0);
  const profitFactor = Math.abs(wins.reduce((a, t) => a + t.pnl, 0) / (grossLoss || -1));
  const avgRR = hasTrades ? trades.reduce((a, t) => a + (t.rr ?? 0), 0) / trades.length : 0;
  const best = hasTrades ? Math.max(...trades.map((t) => t.pnl)) : 0;
  const worst = hasTrades ? Math.min(...trades.map((t) => t.pnl)) : 0;

  // What a strategy actually lives or dies by: the size of an average win
  // against an average loss, and the win rate that pairing demands.
  //
  // `payoff` is the realised reward-to-risk — the planned one, Trade.rr, is
  // rarely filled in and says nothing about what the exits really returned.
  // `breakevenWinRate` is 1 / (1 + payoff): the share of trades that must win
  // for the account to stand still. The distance between it and the real win
  // rate is the only number that says whether a setup is profitable, and
  // `expectancy` puts that distance in money — what one more trade is worth on
  // average.
  const absAvgLoss = Math.abs(avgLoss);
  const payoff = absAvgLoss > 0 ? avgWin / absAvgLoss : 0;
  const breakevenWinRate = payoff > 0 ? 1 / (1 + payoff) : 0;
  const expectancy = hasTrades ? winRate * avgWin - (1 - winRate) * absAvgLoss : 0;
  // The same expectancy expressed in R — in multiples of one average loss —
  // which is what makes two setups risking different amounts comparable.
  const expectancyR = absAvgLoss > 0 ? expectancy / absAvgLoss : 0;

  let streak = 0;
  const streakType: "win" | "loss" = hasTrades ? trades[trades.length - 1].outcome : "win";
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].outcome === streakType) streak++;
    else break;
  }

  let cum = 0;
  const cumSeries = hasTrades ? trades.map((t) => (cum += t.pnl)) : [0];
  const min = Math.min(0, ...cumSeries);
  const max = Math.max(...cumSeries);
  const range = max - min || 1;
  const equityPoints = cumSeries
    .map((v, i) => {
      const x = (i / (cumSeries.length - 1 || 1)) * 600;
      const y = 140 - ((v - min) / range) * 130 - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const equityFillPoints = `0,145 ${equityPoints} 600,145`;

  return {
    hasTrades,
    wins,
    losses,
    winRate,
    totalPnl,
    avgWin,
    avgLoss,
    profitFactor,
    avgRR,
    payoff,
    breakevenWinRate,
    expectancy,
    expectancyR,
    best,
    worst,
    streak,
    streakType,
    equityPoints,
    equityFillPoints,
  };
}

/**
 * What a higher reward-to-risk would be worth, at today's win rate.
 *
 * Being above the breakeven line only says the account grows; it says nothing
 * about how fast. Raising the payoff is the lever that does, and this puts a
 * number on it: keep the average loss where it is, take profit at `target`
 * times that, and the expectancy per trade becomes `winRate * target * loss -
 * (1 - winRate) * loss`.
 *
 * `sustainableWinRate` is the honest half of the answer. A further target is
 * hit less often, so the win rate will fall — this is the rate at which the
 * new ratio stops being an improvement, i.e. where it earns exactly what the
 * journal earns today. Anything above it is still a gain.
 */
export function projectPayoff(stats: ReturnType<typeof computeDashboardStats>, target: number) {
  const loss = Math.abs(stats.avgLoss);
  const expectancy = stats.winRate * target * loss - (1 - stats.winRate) * loss;
  // Solving `wr * target * loss - (1 - wr) * loss = currentExpectancy` for wr.
  const sustainableWinRate = (stats.expectancyR + 1) / (target + 1);
  return { target, expectancy, expectancyR: loss > 0 ? expectancy / loss : 0, sustainableWinRate };
}

/**
 * The ratios worth aiming at next: the standard rungs above where the journal
 * already stands. A journal already past 3 gets one rung of its own rather than
 * an empty list.
 */
export function payoffTargets(payoff: number): number[] {
  const rungs = [1.5, 2, 3].filter((r) => r > payoff + 0.05);
  return rungs.length ? rungs : [Math.round((payoff + 1) * 2) / 2];
}

/**
 * The same profitability read, one row per setup, busiest first.
 *
 * A setup with no losing trade yet has no average loss to divide by, so its
 * payoff and its breakeven line are meaningless rather than infinite: those
 * rows carry `payoff: 0` and are shown as "—".
 */
export function computeSetupStats(trades: TradeWithOutcome[]) {
  const bySetup = new Map<string, TradeWithOutcome[]>();
  for (const trade of trades) {
    bySetup.set(trade.setup, [...(bySetup.get(trade.setup) ?? []), trade]);
  }
  return [...bySetup.entries()]
    .map(([setup, rows]) => {
      const stats = computeDashboardStats(rows);
      return {
        setup,
        count: rows.length,
        winRate: stats.winRate,
        payoff: stats.payoff,
        breakevenWinRate: stats.breakevenWinRate,
        expectancy: stats.expectancy,
        totalPnl: stats.totalPnl,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function buildMonthlyCalendar(trades: TradeWithOutcome[], year: number, monthIndex0: number) {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay();
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const cells: {
    isDay: boolean;
    dayNum?: number;
    pnl?: number;
    hasTrades?: boolean;
    isWin?: boolean;
  }[] = [];

  for (let i = 0; i < firstWeekday; i++) cells.push({ isDay: false });

  for (let d = 1; d <= daysInMonth; d++) {
    const dayTrades = trades.filter(
      (t) => t.date.getFullYear() === year && t.date.getMonth() === monthIndex0 && t.date.getDate() === d
    );
    const dayPnl = dayTrades.reduce((a, t) => a + t.pnl, 0);
    const has = dayTrades.length > 0;
    cells.push({ isDay: true, dayNum: d, pnl: dayPnl, hasTrades: has, isWin: has && dayPnl > 0 });
  }

  return cells;
}
