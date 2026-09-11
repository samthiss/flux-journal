/**
 * Tuning a volume alert from what it actually fired.
 *
 * The alert paints a box red past a threshold, and the threshold has to hold a
 * rate — one to five an hour, no more — across days whose volume is not
 * comparable. A Monday at zero and a Tuesday at six are the same setting
 * meeting two different markets.
 *
 * Nothing here models that. Every figure below is a recount of the boxes as
 * they were written down: at 200, this hour would have given one alert instead
 * of three. A recommendation is therefore the smallest threshold whose recount
 * lands under the ceiling — not a fit, not a projection.
 */

export type AlertHour = {
  day: string;
  hour: number;
  threshold: number;
  values: number[];
  market: string;
};

/** How many alerts an hour would have shown at `threshold`. */
export const countAt = (hour: AlertHour, threshold: number) =>
  hour.values.filter((value) => value >= threshold).length;

/**
 * Whether an hour can speak about a threshold at all.
 *
 * Only from its own threshold up. An hour watched at 150 knows nothing about
 * 120: the boxes between the two were never painted, so counting them as
 * absent would invent a quiet hour.
 */
export const canAnswer = (hour: AlertHour, threshold: number) => threshold >= hour.threshold;

export type BandStat = {
  /** The hour the band opens. */
  hour: number;
  /** Hours recorded in this band. */
  sessions: number;
  /** The threshold most of them were watched at. */
  threshold: number;
  /** Alerts per hour at that threshold. */
  rate: number;
  /** The whole curve: threshold to alerts per hour, as far as it can be read. */
  curve: { threshold: number; rate: number }[];
  /** The smallest threshold holding the ceiling, or null when none can. */
  recommended: number | null;
  /** What it would give, so a recommendation can be judged rather than obeyed. */
  recommendedRate: number | null;
};

const STEP = 10;

/** The rate a set of hours would have shown at one threshold, or null. */
function rateAt(hours: AlertHour[], threshold: number): number | null {
  const usable = hours.filter((hour) => canAnswer(hour, threshold));
  if (usable.length === 0) return null;
  return usable.reduce((n, hour) => n + countAt(hour, threshold), 0) / usable.length;
}

function commonest(numbers: number[]): number {
  const tally = new Map<number, number>();
  for (const n of numbers) tally.set(n, (tally.get(n) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Each hour band of the day, as the recorded hours describe it.
 *
 * `ceiling` is the most alerts an hour may show — a ceiling and not a target,
 * because a threshold pushed down until a dead session produces an alert is a
 * threshold that manufactures noise. A quiet hour is an answer.
 */
export function bandStats(hours: AlertHour[], ceiling: number): BandStat[] {
  const bands = new Map<number, AlertHour[]>();
  for (const hour of hours) (bands.get(hour.hour) ?? bands.set(hour.hour, []).get(hour.hour)!).push(hour);

  return [...bands.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, recorded]) => {
      const threshold = commonest(recorded.map((h) => h.threshold));
      const floor = Math.min(...recorded.map((h) => h.threshold));
      const top = Math.max(floor, ...recorded.flatMap((h) => h.values));

      const curve: { threshold: number; rate: number }[] = [];
      for (let t = Math.ceil(floor / STEP) * STEP; t <= top + STEP; t += STEP) {
        const rate = rateAt(recorded, t);
        if (rate !== null) curve.push({ threshold: t, rate });
      }

      const held = curve.find((point) => point.rate <= ceiling) ?? null;

      return {
        hour,
        sessions: recorded.length,
        threshold,
        rate: rateAt(recorded, threshold) ?? 0,
        curve,
        recommended: held?.threshold ?? null,
        recommendedRate: held?.rate ?? null,
      };
    });
}

/** The days a set of hours covers, newest first. */
export function byDay(hours: AlertHour[]): [string, AlertHour[]][] {
  const days = new Map<string, AlertHour[]>();
  for (const hour of hours) (days.get(hour.day) ?? days.set(hour.day, []).get(hour.day)!).push(hour);
  for (const [, rows] of days) rows.sort((a, b) => a.hour - b.hour);
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/** "3h-4h", the way the hours are spoken about here. */
export const bandLabel = (hour: number) => `${hour}h-${hour + 1}h`;
