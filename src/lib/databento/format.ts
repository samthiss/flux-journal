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
