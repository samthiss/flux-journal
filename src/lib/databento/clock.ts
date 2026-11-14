/**
 * Chicago wall time and back, for the day's sheet: the exchange's hours are
 * Chicago's, the trader's are Europe's, and daylight saving does not change
 * on the same dates on both sides.
 */
export const TZ = "America/Chicago";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

/** Chicago's calendar and clock at an instant. */
export function chicago(t: number) {
  const p = Object.fromEntries(parts.formatToParts(t).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, weekday: p.weekday as string };
}

/** The instant a Chicago date and hour fall on. */
export function chicagoInstant(y: number, m: number, d: number, h = 0, min = 0): number {
  const want = Date.UTC(y, m - 1, d, h, min);
  let t = want + 6 * 3600000;
  // Two passes settle it, daylight saving included.
  for (let i = 0; i < 2; i++) {
    const c = chicago(t);
    t += want - Date.UTC(c.y, c.m - 1, c.d, c.h, c.min);
  }
  return t;
}

/**
 * The session the sheet is for, as a Chicago date: today's until the
 * 16:00 close, then the next one; Saturday's and Sunday's are Monday's.
 */
export function sessionDate(now: number): { y: number; m: number; d: number } {
  const c = chicago(now);
  let add = c.h >= 16 ? 1 : 0;
  const day = (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(c.weekday) + add) % 7;
  if (day === 6) add += 2;
  else if (day === 0) add += 1;
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + add));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
