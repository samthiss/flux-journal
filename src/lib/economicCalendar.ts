/**
 * The day's economic releases, in the journal's own words.
 *
 * The investing.com widget this replaced could not be shown at all: it answers
 * 403 to anything that is not a browser, and refuses to be framed by anything
 * that is — so the card held a blank white page. This reads the ForexFactory
 * weekly feed instead, which is plain XML and answers to a plain request.
 *
 * That feed rate-limits hard, so it is fetched at most once an hour and the
 * cached copy serves everyone in between. A day's releases do not change often
 * enough for that to cost anything.
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
};

const FEED = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

/** The contracts this journal trades, plus the currency they settle against. */
const CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "CHF"]);

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
    });
  }

  return events.sort((a, b) => (a.at ?? `${a.date}T00:00`).localeCompare(b.at ?? `${b.date}T00:00`));
}

/**
 * This week's releases, or an empty list when the feed cannot be reached.
 *
 * A calendar that fails is a calendar that says nothing, not a page that fails
 * to load: the checklist around it still has to be usable.
 */
export async function getEconomicEvents(): Promise<{ events: EconomicEvent[]; ok: boolean }> {
  try {
    const res = await fetch(FEED, {
      headers: {
        // The feed answers a plain request, but not one with no user agent.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/xml,application/xml,*/*",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { events: [], ok: false };
    const xml = await res.text();
    if (!xml.trimStart().startsWith("<?xml")) return { events: [], ok: false }; // rate limited
    return { events: parseCalendarFeed(xml), ok: true };
  } catch {
    return { events: [], ok: false };
  }
}
