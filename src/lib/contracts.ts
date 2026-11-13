/**
 * Tick size and tick value of the futures the journal backtests.
 *
 * CME and Eurex specifications at the time of writing, for one contract. The
 * tick size is what a price moves by; the value is what that move is worth.
 * FGBL is in euros — the only one here that is not in dollars.
 */
export type ContractSpec = { tickSize: number; tickValue: number };

export const CONTRACTS: Record<string, ContractSpec> = {
  // Currencies
  "6E": { tickSize: 0.00005, tickValue: 6.25 },
  "6B": { tickSize: 0.0001, tickValue: 6.25 },
  "6J": { tickSize: 0.0000005, tickValue: 6.25 },
  "6A": { tickSize: 0.00005, tickValue: 5 },
  "6C": { tickSize: 0.00005, tickValue: 5 },
  "6S": { tickSize: 0.00005, tickValue: 6.25 },
  "6N": { tickSize: 0.00005, tickValue: 5 },
  // Indices
  ES: { tickSize: 0.25, tickValue: 12.5 },
  MES: { tickSize: 0.25, tickValue: 1.25 },
  NQ: { tickSize: 0.25, tickValue: 5 },
  MNQ: { tickSize: 0.25, tickValue: 0.5 },
  YM: { tickSize: 1, tickValue: 5 },
  MYM: { tickSize: 1, tickValue: 0.5 },
  RTY: { tickSize: 0.1, tickValue: 5 },
  M2K: { tickSize: 0.1, tickValue: 0.5 },
  // Metals and energy
  GC: { tickSize: 0.1, tickValue: 10 },
  MGC: { tickSize: 0.1, tickValue: 1 },
  SI: { tickSize: 0.005, tickValue: 25 },
  CL: { tickSize: 0.01, tickValue: 10 },
  MCL: { tickSize: 0.01, tickValue: 1 },
  NG: { tickSize: 0.001, tickValue: 10 },
  // Grains and rates
  ZS: { tickSize: 0.25, tickValue: 12.5 },
  ZW: { tickSize: 0.25, tickValue: 12.5 },
  ZC: { tickSize: 0.25, tickValue: 12.5 },
  ZM: { tickSize: 0.1, tickValue: 10 },
  ZL: { tickSize: 0.01, tickValue: 6 },
  ZB: { tickSize: 1 / 32, tickValue: 31.25 },
  ZN: { tickSize: 1 / 64, tickValue: 15.625 },
  FGBL: { tickSize: 0.01, tickValue: 10 },
};

/** Dollars per tick, for the symbols that have a spec. */
export const TICK_VALUES: Record<string, number> = Object.fromEntries(
  Object.entries(CONTRACTS).map(([s, c]) => [s, c.tickValue])
);
