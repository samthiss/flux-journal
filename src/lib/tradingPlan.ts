/**
 * The day's plan, worked out the same way on the server (the reminders) and
 * in the page: each pair's order windows, its order prices, and what a trade
 * made. Pure: no database, no clock of its own.
 */
import { chicago, chicagoInstant } from "@/lib/databento/clock";
import { newsCurrencies } from "@/lib/contracts";

/** A pair as the plan trades it: its levels and its backtested setting. */
export type PairPlan = {
  symbol: string;
  /** Highest first. */
  levels: number[];
  tick: number;
  tickValue: number;
  lots: number;
  /** Ticks before (+) or beyond (−) the level the order sits. */
  offset: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  /** Order hours, Chicago, [from, to). */
  hours: [number, number];
  /** Chicago hours with no new order. */
  exclude: number[];
  /** Why those hours. */
  why?: string;
};

/** A release that blocks orders: the source's three stars. */
export type Blocking = { at: number; currency: string; title: string };

/** No order this long either side of a blocking release. */
export const BLACKOUT_MS = 10 * 60000;
/** The account's limits the page watches. */
export const MAX_POSITIONS = 2;
export const MAX_CONTRACTS = 5;
export const DAY_LIMIT = -500;

/** YYYY-MM-DD of a Chicago date. */
export const dayKey = (d: { y: number; m: number; d: number }) => `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
export const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
};

/** The releases a pair's orders must stand clear of. */
export const blocksFor = (symbol: string, news: Blocking[]) => news.filter((n) => newsCurrencies(symbol).includes(n.currency));

/**
 * A pair's order windows on a Chicago date, as instants: its hours, less its
 * excluded hours, less ten minutes either side of each blocking release.
 */
export function orderWindows(p: PairPlan, day: string, news: Blocking[]): [number, number][] {
  const { y, m, d } = parseDay(day);
  let segs: [number, number][] = [];
  for (let h = p.hours[0]; h < p.hours[1]; h++) {
    if (p.exclude.includes(h)) continue;
    const a = chicagoInstant(y, m, d, h);
    const b = chicagoInstant(y, m, d, h + 1);
    const last = segs[segs.length - 1];
    if (last && last[1] === a) last[1] = b;
    else segs.push([a, b]);
  }
  for (const n of blocksFor(p.symbol, news)) {
    const a = n.at - BLACKOUT_MS;
    const b = n.at + BLACKOUT_MS;
    segs = segs.flatMap(([s, e]): [number, number][] => (b <= s || a >= e ? [[s, e]] : ([[s, a], [b, e]] as [number, number][]).filter(([x, z]) => z > x)));
  }
  return segs;
}

/** Why a window ends where it does: a release, an excluded hour, or the end of the orders. */
export function windowEndReason(p: PairPlan, end: number, day: string, news: Blocking[]) {
  const n = blocksFor(p.symbol, news).find((x) => Math.abs(x.at - BLACKOUT_MS - end) < 60000);
  if (n) return `news ${n.currency} ${n.title}`;
  const { y, m, d } = parseDay(day);
  if (Math.abs(chicagoInstant(y, m, d, p.hours[1]) - end) < 60000) return "fin des ordres";
  return `heures exclues ${p.symbol}`;
}

/** The order prices on a level: entry, stop and targets, for a buy and a sell. */
export function orderPrices(p: PairPlan, level: number) {
  const side = (dir: 1 | -1) => {
    const entry = level + dir * p.offset * p.tick;
    return {
      entry,
      sl: entry - dir * p.sl * p.tick,
      tp1: entry + dir * p.tp1 * p.tick,
      tp2: p.tp2 ? entry + dir * p.tp2 * p.tick : null,
    };
  };
  return { buy: side(1), sell: side(-1) };
}

export type Outcome = "SL" | "TP1" | "TRAIL" | "TP2" | "TIME";
export const OUTCOME_TEXT: Record<Outcome, string> = {
  SL: "Stop touché",
  TP1: "TP1, runner sorti à l'entrée",
  TRAIL: "TP1 + trailing",
  TP2: "TP1 + TP2",
  TIME: "Clôturé (durée max) / autre",
};

/**
 * What a trade made at the plan's size, in dollars: half the lots out at TP1,
 * the other half on the runner. `extra` is the runner's ticks on a trail, or
 * the dollars typed for an exit the plan cannot price.
 */
export function pnlOf(p: PairPlan, outcome: Outcome, extra = 0) {
  const half = (p.lots / 2) * p.tickValue;
  switch (outcome) {
    case "SL":
      return -p.sl * p.tickValue * p.lots;
    case "TP1":
      return p.tp1 * half;
    case "TP2":
      return (p.tp1 + (p.tp2 ?? p.tp1)) * half;
    case "TRAIL":
      return (p.tp1 + extra) * half;
    case "TIME":
      return extra;
  }
}

/** Chicago hours and minutes of an instant, as "07:52". */
export const ctClock = (t: number) => {
  const c = chicago(t);
  return `${String(c.h).padStart(2, "0")}:${String(c.min).padStart(2, "0")}`;
};
export const berClock = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
