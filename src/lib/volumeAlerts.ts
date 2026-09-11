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

export type Stat = {
  /** Hours recorded in this band. */
  sessions: number;
  /**
   * Days those hours are spread over.
   *
   * The figure that decides whether any of this may be acted on. Four hours
   * can be one morning, and one morning is a market having a mood — a setting
   * is judged over a week, or it chases yesterday.
   */
  days: number;
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
  /**
   * Where the threshold should come down to, when the band is too quiet.
   *
   * An estimate, and the only one in this file: below the threshold in force
   * nothing was ever written down, so this is the observed decay carried on
   * past the edge of the data rather than a recount. Null when the tail is too
   * short to carry, or when the band is not short of alerts.
   */
  lowerTo: number | null;
};

export type BandStat = Stat & {
  /** The hour the band opens. */
  hour: number;
};

/**
 * A stretch of the day the alert is set for as a whole.
 *
 * Before the cash open and after it are not the same market — the same
 * threshold that sits right at 3h floods 15h — so a setting is chosen per
 * session, and the hours are only the detail underneath.
 *
 * `end` is exclusive and may wrap past midnight: 7 to 0 is the whole afternoon
 * and evening.
 */
export type Session = { start: number; end: number };

export type SessionStat = Stat & { session: Session };

export const inSession = (hour: number, { start, end }: Session) =>
  end > start ? hour >= start && hour < end : hour >= start || hour < end;

export const sessionLabel = ({ start, end }: Session) => `${start}h-${end}h`;

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
 * `ceiling` is the most alerts an hour may show. `floor` is the fewest before
 * the setting is called too high — left at zero by default, because a single
 * dead session is an answer, not a fault: a threshold pushed down until it
 * produces an alert manufactures noise. What justifies a floor is a band that
 * stays quiet over many hours, which is a mis-set alert rather than a market.
 */
/**
 * The threshold a band would need to reach `floor` alerts an hour, guessed.
 *
 * The only estimate in this file, and it is one because it has to be: below
 * the threshold in force nothing was ever written down, so no recount can
 * reach there. It is reported apart from every other figure for that reason.
 *
 * What it leans on is the shape volume exceedances take — how far a box
 * overshoots the threshold decays about exponentially, so the average overshoot
 * is the scale of the whole tail. Four boxes at 168, 155, 262 and 173 over a
 * threshold of 150 overshoot by 39 on average, which says the rate roughly
 * doubles for every 27 points the threshold comes down.
 *
 * Fitted on the overshoots rather than on the stepped curve, which one large
 * box flattens into a long tail of equal rates and a slope that means nothing.
 * It refuses to reach more than a third under the threshold watched, where
 * there is nothing left to lean on, and refuses under five boxes.
 */
function lowerToward(hours: AlertHour[], floor: number): number | null {
  const watched = Math.min(...hours.map((hour) => hour.threshold));
  const usable = hours.filter((hour) => hour.threshold === watched);
  const values = usable.flatMap((hour) => hour.values);
  if (values.length < 5) return null;

  const rate = values.length / usable.length;
  if (rate >= floor) return null;

  const overshoot = values.reduce((sum, value) => sum + (value - watched), 0) / values.length;
  if (overshoot <= 0) return null;

  const target = watched + overshoot * Math.log(rate / floor);
  if (target < watched * 0.66) return null;

  const rounded = Math.round(target / STEP) * STEP;
  // A miss small enough to round back onto the setting in force is not advice.
  if (rounded >= watched) return null;

  return rounded;
}

function statsFor(recorded: AlertHour[], ceiling: number, floor: number): Stat {
  const threshold = commonest(recorded.map((h) => h.threshold));
  // The lowest threshold ever watched here: the curve cannot start below it.
  const lowest = Math.min(...recorded.map((h) => h.threshold));
  const top = Math.max(lowest, ...recorded.flatMap((h) => h.values));

  const curve: { threshold: number; rate: number }[] = [];
  for (let t = Math.ceil(lowest / STEP) * STEP; t <= top + STEP; t += STEP) {
    const rate = rateAt(recorded, t);
    if (rate !== null) curve.push({ threshold: t, rate });
  }

  const held = curve.find((point) => point.rate <= ceiling) ?? null;
  const rate = rateAt(recorded, threshold) ?? 0;

  return {
    sessions: recorded.length,
    days: new Set(recorded.map((hour) => hour.day)).size,
    threshold,
    rate,
    curve,
    recommended: held?.threshold ?? null,
    recommendedRate: held?.rate ?? null,
    lowerTo: floor > 0 && rate < floor ? lowerToward(recorded, floor) : null,
  };
}

/**
 * Each hour band of the day, as the recorded hours describe it.
 *
 * `ceiling` is the most alerts an hour may show. `floor` is the fewest before
 * the setting is called too high — left at zero by default, because a single
 * dead session is an answer, not a fault: a threshold pushed down until it
 * produces an alert manufactures noise. What justifies a floor is a band that
 * stays quiet over many hours, which is a mis-set alert rather than a market.
 */
export function bandStats(hours: AlertHour[], ceiling: number, floor = 0): BandStat[] {
  const bands = new Map<number, AlertHour[]>();
  for (const hour of hours) (bands.get(hour.hour) ?? bands.set(hour.hour, []).get(hour.hour)!).push(hour);

  return [...bands.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, recorded]) => ({ hour, ...statsFor(recorded, ceiling, floor) }));
}

/**
 * The same reading, one stretch of the day at a time.
 *
 * This is the figure to act on: the alert is set once for a session, not hour
 * by hour, and a session pools enough hours to say something after a few days
 * where a single band is still an anecdote. The hours remain underneath, for
 * when one of them turns out to carry the whole session.
 */
export function sessionStats(hours: AlertHour[], sessions: Session[], ceiling: number, floor = 0): SessionStat[] {
  return sessions.flatMap((session) => {
    const recorded = hours.filter((hour) => inSession(hour.hour, session));
    if (recorded.length === 0) return [];
    return [{ session, ...statsFor(recorded, ceiling, floor) }];
  });
}

/**
 * The hours falling in the last `days` days, or all of them.
 *
 * A rolling window rather than the calendar week: a week gives one Monday, and
 * a public holiday or a payrolls Friday would set the threshold for the month.
 * Counted back from the newest day recorded, not from today, so the reading
 * does not empty itself over a weekend.
 */
export function recent(hours: AlertHour[], days: number | null): AlertHour[] {
  if (days === null || hours.length === 0) return hours;

  const newest = hours.reduce((latest, hour) => (hour.day > latest ? hour.day : latest), hours[0].day);
  const from = new Date(`${newest}T12:00:00`);
  from.setDate(from.getDate() - (days - 1));
  const cutoff = from.toLocaleDateString("en-CA");

  return hours.filter((hour) => hour.day >= cutoff);
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
