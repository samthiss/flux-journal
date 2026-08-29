/**
 * Monte Carlo for a prop-firm challenge.
 *
 * A closed formula cannot answer this. Whether a trailing drawdown is hit
 * depends on the *order* the wins and losses arrive in, not on their averages:
 * the same set of trades passes comfortably in one sequence and busts in
 * another. So each run replays a sequence, trade by trade, against the account's
 * rules.
 *
 * What the model assumes, and what it therefore cannot tell you:
 *   - Trades are independent. A losing streak driven by a market regime, or by
 *     the tilt that follows a bad day, is not modelled.
 *   - The risk is the same on every trade.
 *   - The trailing drawdown is measured on closed-trade equity. A firm that
 *     measures it intraday, on unrealised P&L, will stop you sooner.
 */

/**
 * The trades a set of parameters describes: a win worth `payoff` times the
 * risk, a loss worth the risk, in the proportion the win rate gives.
 *
 * A thousand entries reproduce the win rate to a tenth of a point — enough for
 * a simulation whose inputs are themselves round numbers — and drawing from
 * them lets the same engine run on described trades and on recorded ones.
 */
export function syntheticSample(winRate: number, payoff: number, risk: number, size = 1000) {
  const wins = Math.round(Math.min(Math.max(winRate, 0), 1) * size);
  return Array.from({ length: size }, (_, i) => (i < wins ? risk * payoff : -risk));
}

/**
 * A trade taken off in two pieces.
 *
 * Scaling out turns a two-outcome trade into a three-outcome one, and the
 * middle outcome is the whole point: the runner does not reach TP2, and what is
 * left depends entirely on where the stop was by then. Moved to breakeven, the
 * trade keeps the first piece; left where it was, the runner gives back its
 * share of the risk and can turn a touched target into a losing trade.
 */
export type PartialExit = {
  /** Share of the position closed at TP1, 0 to 1. */
  share1: number;
  /** Targets in multiples of the risk. */
  tp1R: number;
  tp2R: number;
  /** How often TP1 is reached at all. */
  tp1Rate: number;
  /** How often TP2 follows, given TP1 was reached. */
  tp2Rate: number;
  /** Whether the stop moves to entry once TP1 is filled. */
  breakevenAfterTp1: boolean;
  risk: number;
};

export type PartialOutcomes = {
  /** The three ways the trade can end: amount and how often. */
  loss: { amount: number; probability: number };
  tp1Only: { amount: number; probability: number };
  both: { amount: number; probability: number };
  expectancy: number;
  /** Expectancy per unit of risk, comparable across position sizes. */
  expectancyR: number;
  /** The reward-to-risk this management actually produces, averaged over wins. */
  effectivePayoff: number;
};

export function partialOutcomes(p: PartialExit): PartialOutcomes {
  // A share outside 0-100% would give the runner a negative size, and every
  // amount below it would be arithmetic on a position that cannot exist.
  const share1 = Math.min(Math.max(p.share1, 0), 1);
  const share2 = 1 - share1;
  const tp1 = p.tp1Rate;
  const tp2 = tp1 * p.tp2Rate;
  const tp1Alone = tp1 - tp2;

  const loss = -p.risk;
  // The runner's fate when TP2 never comes: nothing at breakeven, its share of
  // the risk otherwise.
  const runnerBack = p.breakevenAfterTp1 ? 0 : -share2 * p.risk;
  const tp1Only = share1 * p.tp1R * p.risk + runnerBack;
  const both = (share1 * p.tp1R + share2 * p.tp2R) * p.risk;

  const expectancy = (1 - tp1) * loss + tp1Alone * tp1Only + tp2 * both;

  // Averaged over the outcomes that made money and those that lost it, so a
  // TP1-only trade that ends negative counts on the losing side where it
  // belongs.
  const wins: [number, number][] = [];
  const losses: [number, number][] = [];
  for (const [amount, probability] of [
    [loss, 1 - tp1],
    [tp1Only, tp1Alone],
    [both, tp2],
  ] as [number, number][]) {
    (amount >= 0 ? wins : losses).push([amount, probability]);
  }
  const mean = (rows: [number, number][]) => {
    const weight = rows.reduce((a, [, prob]) => a + prob, 0);
    return weight ? rows.reduce((a, [amount, prob]) => a + amount * prob, 0) / weight : 0;
  };
  const avgWin = mean(wins);
  const avgLoss = Math.abs(mean(losses));

  return {
    loss: { amount: loss, probability: 1 - tp1 },
    tp1Only: { amount: tp1Only, probability: tp1Alone },
    both: { amount: both, probability: tp2 },
    expectancy,
    expectancyR: p.risk ? expectancy / p.risk : 0,
    effectivePayoff: avgLoss ? avgWin / avgLoss : 0,
  };
}

/** The same three outcomes as a sample the simulation can draw from. */
export function partialSample(p: PartialExit, size = 1000) {
  const o = partialOutcomes(p);
  const nLoss = Math.round(o.loss.probability * size);
  const nTp1 = Math.round(o.tp1Only.probability * size);
  return Array.from({ length: size }, (_, i) =>
    i < nLoss ? o.loss.amount : i < nLoss + nTp1 ? o.tp1Only.amount : o.both.amount
  );
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
