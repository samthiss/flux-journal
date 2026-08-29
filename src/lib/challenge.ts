/**
 * Monte Carlo for a prop-firm challenge, run on the journal's own trades.
 *
 * A closed formula cannot answer this. Whether a trailing drawdown is hit
 * depends on the *order* the wins and losses arrive in, not on their averages:
 * the same set of trades passes comfortably in one sequence and busts in
 * another. So each run replays a plausible sequence — trades drawn with
 * replacement from what the journal actually recorded, which keeps the real
 * shape of the results, outliers included, instead of assuming every win is the
 * average win.
 *
 * What the model assumes, and what it therefore cannot tell you:
 *   - Trades are independent. A losing streak driven by a market regime, or by
 *     the tilt that follows a bad day, is not in the data and not modelled.
 *   - P&L scales linearly with size. Doubling the contracts doubles the result,
 *     which ignores the slippage and the fill quality that come with size.
 *   - The trailing drawdown is measured on closed-trade equity. A firm that
 *     measures it intraday, on unrealised P&L, will stop you sooner.
 *   - The future resembles the recorded past. On a few dozen trades that is a
 *     strong assumption, and the narrower the sample the stronger it gets.
 */

/**
 * A stress test on the sample itself.
 *
 * The journal is a few dozen trades long, and a good run of them flatters every
 * figure derived from it — a setup that shows no losing sequence has not proven
 * it has none, it has proven the sample is short. `haircut` shaves the winners
 * by a fraction and leaves the losses alone, which is what a weaker edge than
 * the recorded one actually looks like.
 */
export function applyHaircut(pnls: number[], haircut: number) {
  if (haircut <= 0) return pnls;
  return pnls.map((p) => (p > 0 ? p * (1 - haircut) : p));
}

/**
 * A sample built from parameters rather than from history: what the trades
 * would look like at a given win rate and reward-to-risk, risking a fixed
 * amount each time.
 *
 * A thousand entries in the right proportion, drawn from uniformly, reproduce
 * the win rate to a tenth of a point — enough for a simulation whose inputs are
 * themselves round numbers, and it lets the same engine run both modes.
 */
export function syntheticSample(winRate: number, payoff: number, risk: number, size = 1000) {
  const wins = Math.round(Math.min(Math.max(winRate, 0), 1) * size);
  return Array.from({ length: size }, (_, i) => (i < wins ? risk * payoff : -risk));
}

export type ChallengeParams = {
  /** Profit that ends the challenge. */
  target: number;
  /** Maximum fall from peak equity before the account is lost. */
  trailingDrawdown: number;
  /** Loss that ends the trading day. Zero disables it. */
  dailyLossLimit: number;
  /** How many trades a trading day holds, on average. */
  tradesPerDay: number;
  /** Trading days simulated before a run is abandoned as too slow. */
  maxDays: number;
};

export type ChallengeOutcome = {
  passRate: number;
  bustRate: number;
  /** Ran out of days without either passing or busting. */
  timeoutRate: number;
  /** Trading days to pass — median and deciles, over the runs that passed. */
  medianDays: number;
  p10Days: number;
  p90Days: number;
};

/**
 * Deterministic PRNG, so a given set of inputs always produces the same
 * figures. A simulation that reshuffled its own answer on every keystroke would
 * be impossible to reason about.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounds 1.3 trades per day to 1 or 2, in that proportion. */
function tradesToday(rate: number, rnd: () => number) {
  const whole = Math.floor(rate);
  return whole + (rnd() < rate - whole ? 1 : 0);
}

/** One trading day, stopping early when the day's loss reaches the limit. */
function simulateDay(
  pnls: number[],
  scale: number,
  p: ChallengeParams,
  rnd: () => number,
  state: { equity: number; peak: number }
): "pass" | "bust" | "ok" {
  let dayPnl = 0;
  const trades = tradesToday(p.tradesPerDay, rnd);

  for (let i = 0; i < trades; i++) {
    const pnl = pnls[Math.floor(rnd() * pnls.length)] * scale;
    state.equity += pnl;
    dayPnl += pnl;
    state.peak = Math.max(state.peak, state.equity);

    if (state.peak - state.equity >= p.trailingDrawdown) return "bust";
    if (state.equity >= p.target) return "pass";
    // The daily limit is a rule of the account, not a preference: once the day
    // is down by it, the remaining trades of that day simply do not happen.
    if (p.dailyLossLimit > 0 && dayPnl <= -p.dailyLossLimit) return "ok";
  }
  return "ok";
}

export function simulateChallenge(
  pnls: number[],
  scale: number,
  params: ChallengeParams,
  runs = 4000,
  seed = 1
): ChallengeOutcome {
  if (!pnls.length) {
    return { passRate: 0, bustRate: 0, timeoutRate: 1, medianDays: 0, p10Days: 0, p90Days: 0 };
  }
  const rnd = mulberry32(seed);
  let pass = 0;
  let bust = 0;
  const daysToPass: number[] = [];

  for (let run = 0; run < runs; run++) {
    const state = { equity: 0, peak: 0 };
    let done: "pass" | "bust" | null = null;
    let day = 0;

    for (; day < params.maxDays && !done; day++) {
      const step = simulateDay(pnls, scale, params, rnd, state);
      if (step !== "ok") done = step;
    }

    if (done === "pass") {
      pass++;
      daysToPass.push(day);
    } else if (done === "bust") {
      bust++;
    }
  }

  daysToPass.sort((a, b) => a - b);
  const at = (q: number) => (daysToPass.length ? daysToPass[Math.floor(q * (daysToPass.length - 1))] : 0);

  return {
    passRate: pass / runs,
    bustRate: bust / runs,
    timeoutRate: (runs - pass - bust) / runs,
    medianDays: at(0.5),
    p10Days: at(0.1),
    p90Days: at(0.9),
  };
}

export type FundedOutcome = {
  /** Monthly P&L: median and deciles. */
  median: number;
  p10: number;
  p90: number;
  /** Share of months that lost the account to the trailing drawdown. */
  ruinRate: number;
};

/**
 * A month on the funded account: the same sequence, with no target to reach and
 * the drawdown still able to end it.
 */
export function simulateFundedMonth(
  pnls: number[],
  scale: number,
  params: ChallengeParams,
  daysPerMonth = 21,
  runs = 4000,
  seed = 7
): FundedOutcome {
  if (!pnls.length) return { median: 0, p10: 0, p90: 0, ruinRate: 0 };
  const rnd = mulberry32(seed);
  const months: number[] = [];
  let ruined = 0;

  for (let run = 0; run < runs; run++) {
    const state = { equity: 0, peak: 0 };
    let dead = false;
    for (let day = 0; day < daysPerMonth && !dead; day++) {
      // No target on a funded account: only the drawdown can end the month.
      const step = simulateDay(pnls, scale, { ...params, target: Infinity }, rnd, state);
      if (step === "bust") dead = true;
    }
    if (dead) ruined++;
    months.push(state.equity);
  }

  months.sort((a, b) => a - b);
  const at = (q: number) => months[Math.floor(q * (months.length - 1))];
  return { median: at(0.5), p10: at(0.1), p90: at(0.9), ruinRate: ruined / runs };
}
