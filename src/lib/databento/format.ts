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
 * Distances as the trader reads them on each market: pips on the currencies
 * (half a pip a tick on most, a whole one on 6B), cents on the grains (a
 * quarter cent a tick), 32nds on Treasuries (half a 32nd a tick). Anything
 * else stays in ticks.
 */
const UNITS: Record<string, { perTick: number; name: string }> = {
  "6E": { perTick: 0.5, name: "pips" },
  "6N": { perTick: 0.5, name: "pips" },
  "6C": { perTick: 0.5, name: "pips" },
  "6A": { perTick: 0.5, name: "pips" },
  "6S": { perTick: 0.5, name: "pips" },
  "6J": { perTick: 0.5, name: "pips" },
  "6B": { perTick: 1, name: "pips" },
  ZS: { perTick: 0.25, name: "cents" },
  ZW: { perTick: 0.25, name: "cents" },
  ZC: { perTick: 0.25, name: "cents" },
  ZN: { perTick: 0.5, name: "/32" },
  ZB: { perTick: 1, name: "/32" },
  ZF: { perTick: 0.25, name: "/32" },
};

const num = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

/** The unit a market's distances are read in. */
export const unitOf = (symbol: string) => UNITS[symbol]?.name ?? "ticks";

/** Ticks as a number in the market's own unit. */
export const inUnit = (symbol: string, ticks: number) => ticks * (UNITS[symbol]?.perTick ?? 1);

/** "12,5 pips", "3 cents", "6/32", or "20 ticks" where no unit is known. */
export function fmtDist(symbol: string, ticks: number) {
  const u = UNITS[symbol];
  if (!u) return `${num(ticks)} ticks`;
  const v = num(ticks * u.perTick);
  // Grains and Treasuries have no pips: their own unit, and the ticks — one line of the ladder each.
  if (u.name === "/32") return `${v}/32 (${num(ticks)} ticks)`;
  if (u.name === "cents") return `${v} cents (${num(ticks)} ticks)`;
  return `${v} ${u.name}`;
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
