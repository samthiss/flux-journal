/**
 * What a market makes of the calendar.
 *
 * A calendar rating says how much a release matters in general; it cannot say
 * how much it matters to whoever is looking. An oil stock draw is the week's
 * number on CL and nothing at all on a currency future, and no single star
 * count can be right for both.
 *
 * So a market carries two things: the currencies it is made of, and how much
 * each family of releases is worth to it. The families come from the calendar
 * source itself — it files every release under one — so this stays a short
 * table rather than an opinion about a hundred titles.
 */

import type { EconomicEvent } from "@/lib/economicCalendar";

export type MarketFocus = {
  /** The legs of the contract. A future on EUR/USD is made of exactly two. */
  currencies: string[];
  /** How the reader is told what the market is watching. */
  summary: string;
  /**
   * The most a release of each family may be worth here, by the source's own
   * category. A ceiling rather than a rating: what this journal already knows
   * about a release can only be lowered by the market, never raised, so a
   * three-star CPI cannot become a four-star one by switching contract.
   *
   * A family left out of the table is not capped — an unclassified release, or
   * a holiday, keeps whatever it had.
   */
  ceilings: Record<string, EconomicEvent["impact"]>;
};

/**
 * The families, as the source names them: mny monetary, prce prices, lbr
 * employment, bsnss business surveys, cnsm consumption, gdp growth, trd trade,
 * hse housing, enrg energy, bnd auctions, mrkt markets, gov government.
 */
const FX_CEILINGS: Record<string, EconomicEvent["impact"]> = {
  // A currency is priced off its central bank, its inflation and its labour
  // market. These keep whatever rating they carry.
  mny: "high",
  prce: "high",
  lbr: "high",

  // Read for direction, rarely traded on the minute.
  bsnss: "medium",
  gdp: "medium",
  cnsm: "medium",
  trd: "medium",

  // Nothing a currency future does at 16:30 depends on these.
  hse: "low",
  enrg: "low",
  bnd: "low",
  mrkt: "low",

  // Speeches, holidays and whatever else a government does. Worth a glance,
  // never worth the top rating on a currency.
  gov: "medium",
};

/**
 * Ceilings that no category can express.
 *
 * The source files an auction under "bnd" in Washington and under "gov" in
 * Berlin and Madrid, so the family alone lets a fifty-year BTP through onto a
 * card about EUR/USD. The title is the only thing the two have in common.
 */
const TITLE_CEILINGS: { pattern: RegExp; ceiling: EconomicEvent["impact"] }[] = [
  { pattern: /\bAuction$/, ceiling: "low" },
];

export const MARKET_FOCUS: Record<string, MarketFocus> = {
  "6E": {
    currencies: ["EUR", "USD"],
    summary: "Zone euro et États-Unis — taux, prix et emploi en tête",
    ceilings: FX_CEILINGS,
  },
  "6B": {
    currencies: ["GBP", "USD"],
    summary: "Royaume-Uni et États-Unis — taux, prix et emploi en tête",
    ceilings: FX_CEILINGS,
  },
};

export function focusFor(market: string): MarketFocus | null {
  return MARKET_FOCUS[market] ?? null;
}

const RANK: Record<EconomicEvent["impact"], number> = { low: 0, medium: 1, high: 2 };

/** A release as this market sees it: its own rating, lowered where it must be. */
export function underFocus(event: EconomicEvent, focus: MarketFocus): EconomicEvent["impact"] {
  // A closed market is a closed market whatever is being traded.
  if (event.kind === "holiday") return event.impact;

  let ceiling = focus.ceilings[event.category];
  for (const rule of TITLE_CEILINGS) {
    if (!rule.pattern.test(event.title)) continue;
    if (!ceiling || RANK[rule.ceiling] < RANK[ceiling]) ceiling = rule.ceiling;
  }

  if (!ceiling || RANK[event.impact] <= RANK[ceiling]) return event.impact;
  return ceiling;
}
