/**
 * The account rules, played over the trades of every symbol in time order.
 *
 * Size by tiers — one lot, then more once the account is far enough up — and
 * a daily stop that ends the day across all markets once its losses reach a
 * figure. Both depend on what came before across the whole account, so they
 * cannot be read off one symbol: they are applied here, to the combined
 * sequence, after the search.
 */

export type Tier = { from: number; lots: number };
export type AccountRules = { tiers: Tier[] | null; dailyStop: number | null };

export const DEFAULT_TIERS: Tier[] = [
  { from: 0, lots: 1 },
  { from: 1000, lots: 1.5 },
  { from: 2000, lots: 2 },
];

export type AccountTrade = { t: number; ticks: number; tickValue: number };
export type AccountRun = { n: number; skipped: number; stopDays: number; pnl: number; maxDD: number; winRate: number; pf: number | null; lastLots: number };

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

export function runAccount(trades: AccountTrade[], fixedLots: number, rules: AccountRules): AccountRun {
  const sorted = [...trades].sort((a, b) => a.t - b.t);
  let eq = 0, peak = 0, maxDD = 0, win = 0, loss = 0, wins = 0, n = 0, skipped = 0, lastLots = fixedLots;
  const dayPnl = new Map<string, number>();
  const stopped = new Set<string>();
  for (const tr of sorted) {
    const day = chicagoDay.format(tr.t);
    if (stopped.has(day)) {
      skipped++;
      continue;
    }
    // The tier is decided by where the account stood before the trade.
    let lots = fixedLots;
    if (rules.tiers?.length) {
      lots = rules.tiers[0].lots;
      for (const t of rules.tiers) if (eq >= t.from) lots = t.lots;
    }
    lastLots = lots;
    const p = tr.ticks * tr.tickValue * lots;
    n++;
    eq += p;
    if (p > 0) {
      win += p;
      wins++;
    } else loss -= p;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
    const d = (dayPnl.get(day) ?? 0) + p;
    dayPnl.set(day, d);
    if (rules.dailyStop !== null && d <= -rules.dailyStop) stopped.add(day);
  }
  return { n, skipped, stopDays: stopped.size, pnl: eq, maxDD, winRate: n ? wins / n : 0, pf: loss > 0 ? win / loss : win > 0 ? null : 0, lastLots };
}
