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
  return trades;
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
    best,
    worst,
    streak,
    streakType,
    equityPoints,
    equityFillPoints,
  };
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
