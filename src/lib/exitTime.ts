/** The longest a trade stays on. */
export const MAX_HOURS = 4;
/** The hour, Chicago time, nothing is left on past. */
export const FLAT_AT_CT = 16;

/** The instant a Chicago wall-clock hour falls at on a Chicago date (YYYY-MM-DD). */
function chicagoAt(day: string, hour: number) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const there = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(guess));
  return guess + ((hour - there + 24) % 24) * 3600000;
}

/**
 * When a trade filled at `filled` must be closed, as the backtest closes it:
 * four hours on, and never past 16h Chicago.
 */
export function exitAt(filled: number) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(filled);
  let flat = chicagoAt(day, FLAT_AT_CT);
  if (flat <= filled) flat += 86400000;
  return Math.min(filled + MAX_HOURS * 3600000, flat);
}
