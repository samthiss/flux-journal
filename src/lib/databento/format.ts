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
 * Distances in ticks — one line of the DOM — on every market: what the
 * trader measures on the platform, always a whole number.
 */
const num = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

/** "25 ticks". */
export const fmtDist = (_symbol: string, ticks: number) => `${num(ticks)} ticks`;

/** What a tick is on each market, for the rules: "6E, 6C : 0,00005 · ZS : 0,25". */
export function tickNote(symbols: string[], tickOf: (symbol: string) => number | undefined) {
  const groups = new Map<string, string[]>();
  for (const s of symbols) {
    const t = tickOf(s);
    if (t === undefined) continue;
    const k = IN_32NDS.has(s) ? "1/64 (un demi-32e)" : fmtPrice(t, s, t);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return "1 tick = une ligne du DOM — " + [...groups].map(([k, ss]) => `${ss.join(", ")} : ${k}`).join(" · ");
}

/** One distance in ticks, for every market: "15 ticks". */
export function fmtDistBySymbol(ticks: number, _symbols: string[]) {
  return `${num(ticks)} ticks`;
}
