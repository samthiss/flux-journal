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
  /**
   * Economies watched from the corner of the eye, capped at two stars.
   *
   * A surprise from the ECB moves the dollar, and the dollar moves an American
   * index — but at one remove, so it should never look like the day's own
   * event. China buys the soybeans and burns the oil, with the same remove.
   */
  watching?: string[];
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

/** An index lives on the Fed, the American consumer and the surveys. */
const INDEX_CEILINGS: Record<string, EconomicEvent["impact"]> = {
  mny: "high",
  prce: "high",
  lbr: "high",
  bsnss: "high",
  cnsm: "high",
  gdp: "medium",
  hse: "medium",
  trd: "medium",
  bnd: "medium",
  gov: "medium",
  enrg: "low",
  mrkt: "low",
};

/** Gold trades the dollar and the real rate; nothing else comes close. */
const GOLD_CEILINGS: Record<string, EconomicEvent["impact"]> = {
  mny: "high",
  prce: "high",
  lbr: "high",
  bnd: "medium",
  bsnss: "medium",
  gdp: "medium",
  cnsm: "medium",
  gov: "medium",
  enrg: "low",
  hse: "low",
  trd: "low",
  mrkt: "low",
};

/** Oil trades the barrel first and the macro second. */
const OIL_CEILINGS: Record<string, EconomicEvent["impact"]> = {
  enrg: "high",
  mny: "medium",
  prce: "medium",
  gdp: "medium",
  lbr: "medium",
  bsnss: "medium",
  gov: "medium",
  cnsm: "low",
  hse: "low",
  bnd: "low",
  trd: "low",
  mrkt: "low",
};

const US_INDEX: MarketFocus = {
  currencies: ["USD"],
  watching: ["EUR"],
  summary: "États-Unis — Fed, prix, emploi, ISM ; la BCE en second",
  ceilings: INDEX_CEILINGS,
};

export const MARKET_FOCUS: Record<string, MarketFocus> = {
  ES: US_INDEX,
  NQ: US_INDEX,
  YM: US_INDEX,
  RTY: US_INDEX,
  GC: {
    currencies: ["USD"],
    watching: ["EUR"],
    summary: "États-Unis — taux réels, prix et emploi",
    ceilings: GOLD_CEILINGS,
  },
  CL: {
    currencies: ["USD"],
    watching: ["CNY"],
    summary: "Stocks et production d'énergie ; la Chine en second",
    ceilings: OIL_CEILINGS,
  },
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

/** Every economy a market reads, its own legs first. */
export function currenciesOf(focus: MarketFocus): string[] {
  return [...focus.currencies, ...(focus.watching ?? [])];
}

const RANK: Record<EconomicEvent["impact"], number> = { low: 0, medium: 1, high: 2 };

/** A release as this market sees it: its own rating, lowered where it must be. */
export function underFocus(event: EconomicEvent, focus: MarketFocus): EconomicEvent["impact"] {
  // A closed market is a closed market whatever is being traded.
  if (event.kind === "holiday") return event.impact;

  let ceiling = focus.ceilings[event.category];
  if (focus.watching?.includes(event.currency) && (!ceiling || RANK.medium < RANK[ceiling])) {
    ceiling = "medium";
  }
  for (const rule of TITLE_CEILINGS) {
    if (!rule.pattern.test(event.title)) continue;
    if (!ceiling || RANK[rule.ceiling] < RANK[ceiling]) ceiling = rule.ceiling;
  }

  if (!ceiling || RANK[event.impact] <= RANK[ceiling]) return event.impact;
  return ceiling;
}
