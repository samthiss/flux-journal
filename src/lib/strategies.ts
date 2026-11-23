/**
 * The bodies of rules a trade is taken under, as the journal offers them.
 *
 * One, now: Level Bounce is what is traded. The others — Volume academy, Trend
 * Retest, the two VWAPs — were offered before anything was taken under them
 * and made a menu to answer rather than a question. A trade that already holds
 * one of them keeps it: the form shows a stored value it does not offer.
 */
export const STRATEGY_OPTIONS = ["Level Bounce"] as const;

/** The yearly levels ("Level Bounce", once "Support / Resistance Yearly"): the strategy backtested on Databento, whose levels and prices the journal can fill in. */
export const YEARLY_LEVELS = "Level Bounce";

/**
 * The strategies a trade is written with a stop, TP1, TP2 and a result. Only
 * the yearly levels have a zone to pick: the others' level is the VWAP or the
 * trend's broken zone, which move, so their prices are typed.
 */
export const PLANNED_STRATEGIES: readonly string[] = [YEARLY_LEVELS, "Trend Retest", "VWAP (Monthly)", "VWAP (Yearly)"];
