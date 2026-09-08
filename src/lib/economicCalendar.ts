/**
 * The economic releases around today, in the journal's own words.
 *
 * The investing.com widget this replaced could not be shown at all: it answers
 * 403 to anything that is not a browser, and refuses to be framed by anything
 * that is — so the card held a blank white page.
 *
 * What reads it now is TradingView's calendar endpoint, which takes a date
 * range and so can answer "hier" and "la semaine prochaine" — the ForexFactory
 * feed used before it publishes the current week and nothing else, and its
 * neighbouring weeks are 404. ForexFactory stays as the fallback: when the
 * range source refuses, this week still shows rather than the card going dark.
 *
 * Both are fetched at most once an hour and the cached copy serves everyone in
 * between; a release does not move often enough for that to cost anything, and
 * the ForexFactory feed rate-limits hard.
 */

export type EconomicEvent = {
  /**
   * The instant of the release, as an ISO string, or null for an entry with no
   * clock ("All Day", "Tentative").
   *
   * An instant rather than a local time, because the server that reads the feed
   * is not in the reader's timezone — Railway runs in UTC — and a release shown
   * two hours early is worse than no calendar at all. The browser turns it into
   * a wall clock.
   */
  at: string | null;
  /** The feed's own date, which is what an entry with no clock is filed under. */
  date: string;
  currency: string;
  title: string;
  impact: "high" | "medium" | "low";
  forecast: string;
  previous: string;
  /** Filled in once a release is out, which is what "hier" is read for. */
  actual: string;
  /**
   * A closed market is not a release.
   *
   * Both sources file holidays as low-importance rows, which is backwards: a
   * session that does not open explains a dead tape better than any print, so
   * these are kept out of the importance filter and shown first in the day.
   */
  kind: "release" | "holiday";
};

const FEED = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";
const RANGE_FEED = "https://economic-calendar.tradingview.com/events";

/**
 * The currencies kept from the feed.
 *
 * Wider than the five this journal trades, because the country filter can only
 * offer what was parsed: the reader picks the five by default and can widen it
 * from the card. The rest of the feed — minor crosses with two entries a week —
 * is dropped here rather than cluttering the filter.
 */
const CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"]);

/**
 * The same list as the range source names them: countries, not currencies.
 *
 * More countries than currencies, because the euro is shared: a German trade
 * balance is filed under DE and carries EUR, so asking for EU alone drops
 * every national release in the zone — including the German ones, which are
 * the ones that move an index traded here.
 */
const COUNTRIES = "US,EU,DE,FR,IT,ES,GB,JP,CH,CA,AU,NZ,CN";

/** What the card starts on: the contracts this journal actually trades. */
export const DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF"];

export const ALL_CURRENCIES = [...CURRENCIES];

function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

/**
 * The feed's clock, which is UTC, read into a real instant.
 *
 * The times carry no offset, so the zone they are published in has to be known
 * rather than guessed. It is UTC: this week's Unemployment Claims — always
 * 8:30am New York — come through as 12:30, and the ECB rate decision, always
 * 14:15 in Paris, as 12:15. Reading them as New York time, which the feed's
 * documentation suggests, put every release four hours late.
 */
function instantFromFeed(month: number, day: number, year: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

const two = (n: number) => String(n).padStart(2, "0");

export function parseCalendarFeed(xml: string): EconomicEvent[] {
  const events: EconomicEvent[] = [];

  for (const [, block] of xml.matchAll(/<event>([\s\S]*?)<\/event>/g)) {
    const currency = field(block, "country");
    if (!CURRENCIES.has(currency)) continue;

    const rawDate = field(block, "date"); // MM-DD-YYYY
    const rawTime = field(block, "time"); // "1:30am", "All Day", "Tentative"
    const [month, day, year] = rawDate.split("-").map(Number);
    if (!month || !day || !year) continue;

    const clock = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(rawTime);
    let at: string | null = null;
    if (clock) {
      let hour = Number(clock[1]) % 12;
      if (/pm/i.test(clock[3])) hour += 12;
      at = instantFromFeed(month, day, year, hour, Number(clock[2])).toISOString();
    }

    const impact = field(block, "impact").toLowerCase();
    events.push({
      at,
      date: `${year}-${two(month)}-${two(day)}`,
      currency,
      title: field(block, "title"),
      impact: impact === "high" ? "high" : impact === "medium" ? "medium" : "low",
      forecast: field(block, "forecast"),
      previous: field(block, "previous"),
      actual: "",
      kind: impact === "holiday" ? "holiday" : "release",
    });
  }

  return events;
}

const sortKey = (e: EconomicEvent) => e.at ?? `${e.date}T00:00`;

/**
 * A browser's headers.
 *
 * Neither source answers a request that looks like a script: the feed wants a
 * user agent, and the range endpoint wants to be called from TradingView's own
 * page. Both are public data read at a browser's pace, once an hour.
 */
const BROWSERISH = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

type RangeEvent = {
  title?: string;
  currency?: string;
  date?: string;
  importance?: number;
  /** "Holidays" for a closed market; the indicator's name otherwise. */
  indicator?: string;
  actual?: number | null;
  forecast?: number | null;
  previous?: number | null;
  unit?: string | null;
  scale?: string | null;
};

/** "2.65" with its unit back on: "2.65%", "$1.2M", "205K". */
function withUnit(value: number | null | undefined, unit: string | null | undefined, scale: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const n = `${value}${scale ?? ""}`;
  if (!unit) return n;
  if (unit === "%") return `${n}%`;
  // Everything else the endpoint sends as a unit is a currency symbol.
  return `${unit}${n}`;
}

const localDate = (d: Date) => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;

async function readRange(from: Date, to: Date): Promise<EconomicEvent[] | null> {
  const url = `${RANGE_FEED}?from=${from.toISOString()}&to=${to.toISOString()}&countries=${COUNTRIES}`;
  try {
    const res = await fetch(url, {
      headers: { ...BROWSERISH, Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/", Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: string; result?: RangeEvent[] };
    if (body.status !== "ok" || !Array.isArray(body.result)) return null;

    return body.result.flatMap((e) => {
      if (!e.date || !e.title || !e.currency || !CURRENCIES.has(e.currency)) return [];
      const at = new Date(e.date);
      if (Number.isNaN(at.getTime())) return [];
      // A holiday is a whole day, not an instant: it is published at midnight
      // UTC, and turning that into a local clock would file an American
      // holiday under the evening before for anyone west of London.
      const holiday = e.indicator === "Holidays";
      return [
        {
          at: holiday ? null : at.toISOString(),
          // A UTC day, only ever used for entries with no clock — which this
          // source does not have; every event here carries an instant.
          date: localDate(at),
          currency: e.currency,
          title: e.title,
          impact: e.importance === 1 ? ("high" as const) : e.importance === 0 ? ("medium" as const) : ("low" as const),
          forecast: withUnit(e.forecast, e.unit, e.scale),
          previous: withUnit(e.previous, e.unit, e.scale),
          actual: withUnit(e.actual, e.unit, e.scale),
          kind: holiday ? ("holiday" as const) : ("release" as const),
        },
      ];
    });
  } catch {
    return null;
  }
}

async function readFeed(): Promise<EconomicEvent[] | null> {
  try {
    const res = await fetch(FEED, {
      headers: { ...BROWSERISH, Accept: "text/xml,application/xml,*/*" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.trimStart().startsWith("<?xml")) return null; // rate limited
    return parseCalendarFeed(xml);
  } catch {
    return null;
  }
}

/**
 * Last week, this week and next week's releases.
 *
 * A calendar that fails is a calendar that says nothing, not a page that fails
 * to load: the checklist around it still has to be usable.
 */
export async function getEconomicEvents(): Promise<{ events: EconomicEvent[]; ok: boolean; source: string }> {
  // Ten days back and sixteen forward: enough for "hier" on a Monday and for
  // all of next week whichever day it is asked on, rounded to whole days so
  // the hourly cache is not re-cut on every request.
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const from = new Date(midnight.getTime() - 10 * 86400000);
  const to = new Date(midnight.getTime() + 16 * 86400000);

  let source = "tradingview";
  let events = await readRange(from, to);
  if (!events) {
    source = "forexfactory";
    events = await readFeed();
  }
  if (!events) return { events: [], ok: false, source };

  return { events: events.sort((a, b) => sortKey(a).localeCompare(sortKey(b))), ok: true, source };
}
