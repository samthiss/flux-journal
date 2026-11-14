/**
 * Prices as the trader's platform shows them: Treasuries in 32nds, halves
 * included (104'06.5), everything else in decimals to its tick, with a comma.
 */
export const IN_32NDS = new Set(["ZN", "ZB", "ZF", "ZT", "UB"]);

export function fmtZone(z: number, symbol?: string) {
  if (symbol && IN_32NDS.has(symbol)) {
    const whole = Math.floor(z);
    const t = Math.round((z - whole) * 64) / 2;
    return `${whole}'${t < 10 ? "0" : ""}${t}`;
  }
  return String(z).replace(".", ",");
}

/** A price to its tick's decimals, or in 32nds for Treasuries. */
export function fmtPrice(p: number, symbol: string, tick: number | undefined) {
  if (IN_32NDS.has(symbol)) return fmtZone(p, symbol);
  let d = 0;
  if (tick) while (d < 10 && Math.abs(Math.round(tick * 10 ** d) - tick * 10 ** d) > 1e-9) d++;
  return p.toFixed(tick ? d : 5).replace(".", ",");
}

/**
 * A price as typed: "1,3186", "1.3186", or for Treasuries "105'09" /
 * "105'09.5" (32nds) as well as a decimal. Null when it is not a price.
 */
export function parsePrice(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!s) return null;
  const q = s.match(/^(\d+)'(\d+(?:\.\d+)?)$/);
  if (q) return Number(q[1]) + Number(q[2]) / 32;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Distances in pips, the one word the trader uses on every market. On the
 * currencies a pip is the usual one: half a pip a tick on most, a whole one
 * on 6B. Grains and Treasuries have no pip of their own: there a pip is one
 * tick, a line of the ladder (ZS 1/4 cent, ZW 1/4 cent, ZN 1/64).
 */
const PIPS_PER_TICK: Record<string, number> = { "6E": 0.5, "6N": 0.5, "6C": 0.5, "6A": 0.5, "6S": 0.5, "6J": 0.5, "6B": 1 };

const num = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

/** Ticks as pips on this market. */
export const inPips = (symbol: string, ticks: number) => ticks * (PIPS_PER_TICK[symbol] ?? 1);

/** "12,5 pips". */
export const fmtDist = (symbol: string, ticks: number) => `${num(inPips(symbol, ticks))} pips`;

/** What a pip is on each market, for the rules. */
export function pipNote(symbols: string[]) {
  const groups = new Map<string, string[]>();
  for (const s of symbols) {
    const per = PIPS_PER_TICK[s] ?? 1;
    const k = per === 1 ? "1 pip = 1 tick" : `1 pip = ${num(1 / per)} ticks`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups].map(([k, ss]) => `${ss.join(", ")} : ${k}`).join(" · ") + " (1 tick = une ligne du DOM)";
}

/** One distance in ticks, said for each market it applies to: "7,5 pips (6E, 6N) · 15 pips (6B)". */
export function fmtDistBySymbol(ticks: number, symbols: string[]) {
  const groups = new Map<string, string[]>();
  for (const s of symbols) {
    const k = fmtDist(s, ticks);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups].map(([k, ss]) => `${k} (${ss.join(", ")})`).join(" · ");
}
