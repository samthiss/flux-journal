/**
 * The days the markets this journal follows are closed, or thin.
 *
 * Computed rather than listed, because a hard-coded list runs out: every rule
 * here is the rule the holiday is actually defined by — a fixed date, the nth
 * weekday of a month, or a distance from Easter — so the same file answers for
 * any year without being maintained.
 *
 * Only the places whose sessions matter to these contracts: the US, since the
 * CME closes; and the euro zone, the UK and Switzerland, which do not close
 * these futures but empty them, and a thin book is its own kind of risk.
 */

export type Holiday = {
  /** Local date, as YYYY-MM-DD. */
  day: string;
  name: string;
  /** Where it is observed, as the calendar's country labels read. */
  place: "US" | "Zone euro" | "UK" | "Suisse";
  /** True when the CME is shut, rather than merely quiet. */
  closesCme?: boolean;
};

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const fromDate = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/**
 * Easter Sunday, by the anonymous Gregorian computus.
 *
 * Four of the holidays below are defined as a distance from it and cannot be
 * derived any other way.
 */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Easter plus or minus a number of days. */
function fromEaster(year: number, offset: number): string {
  const d = easter(year);
  d.setDate(d.getDate() + offset);
  return fromDate(d);
}

/** The nth given weekday of a month; n = -1 for the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(year, month - 1, 1);
    const shift = (weekday - first.getDay() + 7) % 7;
    return iso(year, month, 1 + shift + (n - 1) * 7);
  }
  const last = new Date(year, month, 0);
  const shift = (last.getDay() - weekday + 7) % 7;
  return fromDate(new Date(year, month - 1, last.getDate() - shift));
}

/**
 * The day a US market actually closes for a fixed-date holiday.
 *
 * Falling on a Saturday it is taken the Friday before, on a Sunday the Monday
 * after — the exchange is shut on the observed day, not the nominal one.
 */
function usObserved(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return fromDate(d);
}

export function holidaysForYear(year: number): Holiday[] {
  const list: Holiday[] = [
    // --- United States: the CME is shut on these ---
    { day: usObserved(year, 1, 1), name: "Jour de l'an", place: "US", closesCme: true },
    { day: nthWeekday(year, 1, 1, 3), name: "Martin Luther King Jr. Day", place: "US", closesCme: true },
    { day: nthWeekday(year, 2, 1, 3), name: "Presidents' Day", place: "US", closesCme: true },
    { day: fromEaster(year, -2), name: "Vendredi saint", place: "US", closesCme: true },
    { day: nthWeekday(year, 5, 1, -1), name: "Memorial Day", place: "US", closesCme: true },
    { day: usObserved(year, 6, 19), name: "Juneteenth", place: "US", closesCme: true },
    { day: usObserved(year, 7, 4), name: "Independence Day", place: "US", closesCme: true },
    { day: nthWeekday(year, 9, 1, 1), name: "Labor Day", place: "US", closesCme: true },
    { day: nthWeekday(year, 11, 4, 4), name: "Thanksgiving", place: "US", closesCme: true },
    { day: usObserved(year, 12, 25), name: "Noël", place: "US", closesCme: true },

    // --- Euro zone: France and Germany, whose sessions carry the 6E ---
    { day: iso(year, 1, 1), name: "Jour de l'an", place: "Zone euro" },
    { day: fromEaster(year, -2), name: "Vendredi saint (DE)", place: "Zone euro" },
    { day: fromEaster(year, 1), name: "Lundi de Pâques", place: "Zone euro" },
    { day: iso(year, 5, 1), name: "Fête du travail", place: "Zone euro" },
    { day: fromEaster(year, 39), name: "Ascension", place: "Zone euro" },
    { day: fromEaster(year, 50), name: "Lundi de Pentecôte", place: "Zone euro" },
    { day: iso(year, 10, 3), name: "Unité allemande", place: "Zone euro" },
    { day: iso(year, 12, 25), name: "Noël", place: "Zone euro" },
    { day: iso(year, 12, 26), name: "Saint-Étienne (DE)", place: "Zone euro" },

    // --- United Kingdom: the 6B ---
    { day: iso(year, 1, 1), name: "New Year's Day", place: "UK" },
    { day: fromEaster(year, -2), name: "Good Friday", place: "UK" },
    { day: fromEaster(year, 1), name: "Easter Monday", place: "UK" },
    { day: nthWeekday(year, 5, 1, 1), name: "Early May bank holiday", place: "UK" },
    { day: nthWeekday(year, 5, 1, -1), name: "Spring bank holiday", place: "UK" },
    { day: nthWeekday(year, 8, 1, -1), name: "Summer bank holiday", place: "UK" },
    { day: iso(year, 12, 25), name: "Christmas", place: "UK" },
    { day: iso(year, 12, 26), name: "Boxing Day", place: "UK" },

    // --- Switzerland ---
    { day: iso(year, 1, 1), name: "Nouvel an", place: "Suisse" },
    { day: iso(year, 1, 2), name: "Saint-Berchtold", place: "Suisse" },
    { day: fromEaster(year, -2), name: "Vendredi saint", place: "Suisse" },
    { day: fromEaster(year, 1), name: "Lundi de Pâques", place: "Suisse" },
    { day: fromEaster(year, 39), name: "Ascension", place: "Suisse" },
    { day: fromEaster(year, 50), name: "Lundi de Pentecôte", place: "Suisse" },
    { day: iso(year, 8, 1), name: "Fête nationale", place: "Suisse" },
    { day: iso(year, 12, 25), name: "Noël", place: "Suisse" },
    { day: iso(year, 12, 26), name: "Saint-Étienne", place: "Suisse" },
  ];
  return list.sort((a, b) => a.day.localeCompare(b.day) || a.place.localeCompare(b.place));
}

/** One entry per date, with the places that observe it gathered on it. */
export type HolidayDay = { day: string; closesCme: boolean; entries: Holiday[] };

/** Saturday or Sunday: a market already shut, so the holiday changes nothing. */
function isWeekend(day: string) {
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

export function upcomingHolidays(from: string, count = 6): HolidayDay[] {
  const year = Number(from.slice(0, 4));
  // Next year's too, so December does not show an empty list. Weekend dates are
  // dropped: the day off is real but the session was closed anyway, and a list
  // of days not to trade should hold only days one could have traded. The US
  // ones are unaffected — they are already moved to the day the exchange
  // actually shuts.
  const all = [...holidaysForYear(year), ...holidaysForYear(year + 1)].filter(
    (h) => h.day >= from && !isWeekend(h.day)
  );
  const byDay = new Map<string, HolidayDay>();
  for (const entry of all) {
    const row = byDay.get(entry.day) ?? { day: entry.day, closesCme: false, entries: [] };
    row.entries.push(entry);
    row.closesCme = row.closesCme || !!entry.closesCme;
    byDay.set(entry.day, row);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(0, count);
}
