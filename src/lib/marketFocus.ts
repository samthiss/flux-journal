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
  /**
   * Ceilings no family can express, matched on the title.
   *
   * The source files an auction under "bnd" in Washington and under "gov" in
   * Berlin and Madrid, so the family alone lets a fifty-year BTP onto a card
   * about EUR/USD. Only the markets that need it carry this — on an index a
   * Treasury auction is worth a glance, and a rule written once for currencies
   * had been hiding it everywhere.
   */
  titleCeilings?: { pattern: RegExp; currency?: string; ceiling: EconomicEvent["impact"] }[];
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
 * Auctions, which no family reliably describes.
 *
 * The source files them under three: "bnd" for a Treasury note, "gov" for a
 * Bund or a Bono, "mrkt" for the ten-year note this journal cared about. So the
 * ceiling has to be written on the title, once per kind of market — worth a
 * glance on an index, where the curve sets the discount rate, and nothing at
 * all on a currency future or a barrel of oil.
 */
const auctionCeiling = (ceiling: EconomicEvent["impact"]) => [{ pattern: /\bAuction$/, ceiling }];

/**
 * Auctions on a currency future: dark, except the American long end.
 *
 * A wide tail on a ten-year note moves the yield, and the yield moves the
 * dollar inside the minute — worth knowing is under way at 19:00, never worth
 * standing aside for, which is what two stars mean.
 *
 * The euro area gets no such rule, and not out of laziness: it has no single
 * issuer. A Spanish Bono auction is not "the euro's auction" the way a Treasury
 * sale is the world's discount rate being set, and eight of them a week would
 * bury the two that matter. Bills stay dark everywhere — thirty a month, moving
 * nothing. Later rules win, so the general case is written first.
 */
const FX_AUCTIONS: { pattern: RegExp; currency?: string; ceiling: EconomicEvent["impact"] }[] = [
  { pattern: /\bAuction$/, ceiling: "low" },
  { pattern: /\b(Note|Bond|TIPS) Auction$/, currency: "USD", ceiling: "medium" },
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
  titleCeilings: auctionCeiling("medium"),
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
    titleCeilings: auctionCeiling("medium"),
  },
  CL: {
    currencies: ["USD"],
    watching: ["CNY"],
    summary: "Stocks et production d'énergie ; la Chine en second",
    ceilings: OIL_CEILINGS,
    titleCeilings: auctionCeiling("low"),
  },
  "6E": {
    currencies: ["EUR", "USD"],
    summary: "Zone euro et États-Unis — taux, prix et emploi en tête",
    ceilings: FX_CEILINGS,
    titleCeilings: FX_AUCTIONS,
  },
  "6B": {
    currencies: ["GBP", "USD"],
    summary: "Royaume-Uni et États-Unis — taux, prix et emploi en tête",
    ceilings: FX_CEILINGS,
    titleCeilings: FX_AUCTIONS,
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

  // The title wins over the family outright, in both directions: it is written
  // precisely because the family is wrong about this release. An auction files
  // as "mrkt" — a family this journal reads as noise — and on an index it is
  // worth two stars, so a rule that could only lower would never say so.
  let ceiling = focus.ceilings[event.category];
  for (const rule of focus.titleCeilings ?? []) {
    if (rule.currency && rule.currency !== event.currency) continue;
    if (rule.pattern.test(event.title)) ceiling = rule.ceiling;
  }

  // Watched at one remove, never the day's own event.
  if (focus.watching?.includes(event.currency) && (!ceiling || RANK.medium < RANK[ceiling])) {
    ceiling = "medium";
  }

  if (!ceiling || RANK[event.impact] <= RANK[ceiling]) return event.impact;
  return ceiling;
}
