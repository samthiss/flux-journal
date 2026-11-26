/**
 * The Databento backtest, run on this machine rather than in the browser.
 *
 * Reads the Databento downloads (bars, or trade files built into one-minute
 * bars, straight out of their zips), reads the year's releases, runs every
 * configuration on each pair under the trader's rules and writes the reports
 * to prisma/databento-results.json — which scripts/seed-databento.ts loads
 * into the journal when the server starts.
 *
 *   npx tsx scripts/databento-analyse.ts
 *
 * The pairs, their levels and the files they come from are the PAIRS table
 * below; the account and session rules are the ones the trader runs.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseDatabentoCsv, mergeDatasets, type Dataset } from "@/lib/databento/parse";
import { analyse, DEFAULT_RULES, sessionDay, type Grid, type Settings } from "@/lib/databento/engine";
import { getHighImpactBetween } from "@/lib/economicCalendar";
import { CONTRACTS, newsCurrencies } from "@/lib/contracts";
import { feeRoundTrip, type AccountRules } from "@/lib/databento/account";

const DOWNLOADS = path.join(homedir(), "Downloads");
const CACHE = path.join(tmpdir(), "flux-databento");

/**
 * The plan, the same for every pair: the order on the level, the stop and
 * TP1 found pair by pair, one lot out at TP1 with the stop to the entry, the
 * other trailed from TP1 at TP1's distance; nothing traded outside 2h–14h
 * Chicago, nothing held more than four hours.
 */
const FX_TP1 = [5, 10, 15, 20, 30];
const GRAIN_TP1 = [5, 10, 15, 20, 30, 40];

/**
 * Where each pair's history is, its levels, the hours (Chicago) it is not
 * traded in, its TP1s to try. The hours kept out are market openings only:
 * 2h, London, for the currencies that move on it; 7h–9h, the American open
 * with its 7:30 figures; 8h, the grains' day session reopening at 8:30.
 */
// Levels moved where the year's turns were (2026-11-14, checked by the
// trader on the chart): 6B 1.3469 → 1.3477, 6N 0.59245 → 0.5930, ZS
// 1227.75 → 1229.75 (then 1229.50, the trader's 1229'4, 2026-11-17), ZW 608.50 → 606.50; 6B 1.3552 and ZW 685, losing
// wherever they were put, are dropped.
// Added (2026-11-14): 6E 1.16595 and 6N 0.59635, 0.58855, 0.58515, 0.56795 —
// found on the turns of November to May, and as good as the others on the
// six months after.
// TP2 (2026-11-15): the platform's bracket wants one even with a trail. Set
// for each pair just under its runners' biggest runs of the year — about one
// runner in ten gets there — so the trail is left to work: on the year it
// costs nothing or a little gains (6N: further out, its long runs pay).
// Levels as zones (2026-11-20, the trader's chart): each line tried from ten
// ticks under to ten over and set in the middle of the ticks that win, so a
// line a tick or two off still works. Dropped, losing almost wherever they
// were put: 6E 1.18435 and 1.1591, 6N 0.58515, 6J 0.006555, ZN 109'275,
// 109'125 and 106'125. ZS 1329.75 and 6N 0.56635 added, too few trades yet
// to judge. 6E redrawn by the trader the same day, the year's supports and
// resistances: 1.185, 1.14175 and 1.11895 dropped, 1.1687 → 1.1683,
// 1.15935 → 1.1597, 1.1406 → 1.1398, 1.16595 kept; 1.213, 1.0921 and
// 1.07455 never reached in the year tested.
// 6B redrawn by the trader (2026-11-21), each line tried thirty ticks either
// way: 1.3405 → 1.3430, 1.3363 and 1.3307 → 1.3335 (one zone, in place of
// 1.3316), 1.3569 dropped; 1.3862 and 1.3045 barely reached. 1.3273 dropped
// too: mid-range, crossed without a bounce on six of fifteen touches (two on
// UK news days), the whole of the pair's worst drawdown, nothing in three months.
// ZS redrawn by the trader (2026-11-21), thirty ticks either way: 1199 in
// place of 1174.75 (losing; a narrow zone, keep it exact), 1294.75 rather
// than 1294.25; 1254.25 and 1184.50, losing almost wherever put, dropped.
// ZW redrawn by the trader (2026-11-21): 677.75 → 680.25 (losing below),
// 577.50 → 575.00; 505.25 added, 790.75 dropped (two trades, losing).
// 6E (2026-11-21): 1.213, 1.19325, 1.0921 and 1.07455 dropped, off the
// trader's chart. 6N redrawn by the trader (2026-11-21), ten ticks either
// way: 0.5931 → 0.5930, 0.5696 → 0.5700; 0.5858, 0.58085 and 0.5823 dropped
// (crossed without a bounce, losing wherever put), 0.57585 not added (weak).
// ZN (2026-11-21), the trader's new zones, ten ticks either way: 111'14,
// 109'315, 108'01, 107'115 and 106'15 added (109'315 and 108'01 narrow: keep
// them exact); 112'245 not added (losing almost wherever put).
// 6E 1.11985 added (2026-11-25), the trader's line, moved up six ticks from
// the 1.11955 he drew: 5 trades rather than 3, for the same drawdown. Two
// caveats to read with it. Its whole history is one visit, 4 October to 10
// November, and price has since left 264 ticks below; and the +550 is the
// best of thirty-three lines tried on five trades, so the extra traffic is
// what the move buys, not the dollars. It sits at the bottom of the year's
// range, where lines get one or two visits against the seven to nine of
// 1.16595 or 1.1683 — expect it to sleep, as 1.13015, which worked only in
// October, does. Near the 1.11895 dropped on 2026-11-20, which measured
// worse wherever it was put.
// ZN 107'115 → 107'14 (2026-11-25), the trader's choice after a sweep. Five
// ticks apart, so this is the same zone moved, not a line added: at a 12-tick
// stop and a 30-bar rearm the two would have competed for the same sessions
// under the one-trade-a-day cap. It trades 2 of 3 reactions rather than 3 of
// 3, but wins both instead of one, and the drawdown does not move: 83 % and
// +3 641 against 80 % and +3 547 on the pair. Ninety-three dollars over the
// year — noise on two trades, kept because the trader drew it there and the
// neighbourhood says nothing against it. The four ticks below the old line,
// 107'065 to 107'08, are the one place not to put it: −378 there.
const PAIRS: Record<string, { source: string; levels: number[]; excludeHours: number[]; tp1s: number[]; pick?: { sl: number; tp1: number; tp2?: number }; offset?: number }> = {
  // Set by the trader: 6B only in London's session, 2h–8h — after it, the
  // American session runs the pound through its levels and only 5-tick
  // targets held. On the morning alone a 25-tick stop and a TP1 of 20 make
  // five times as much a trade, on half as many, for a lower drawdown.
  // TP1 18 rather than 20 (2026-11-16): since July price often stopped at
  // 17–19 ticks; 18 gives up 18 a month on the year and does better since.
  "6B": { source: "GLBX-20261113-578Q94WBNM/6b_front_1m.csv", levels: [1.3045, 1.3189, 1.3335, 1.343, 1.3478, 1.3652, 1.3862], excludeHours: [8, 9, 10, 11, 12, 13], tp1s: FX_TP1, pick: { sl: 25, tp1: 18, tp2: 75 } },
  // A 25-tick stop and a TP1 of 30 (2026-11-26), where a 12-tick stop and a
  // TP1 of 15 stood: 1,173 a month against 613, and the pair's drawdown down
  // from 1,350 to 1,075. The 12-tick stop was inside the euro's own noise —
  // thirty of its ninety-three trades were stopped, twenty-three of them
  // after going into profit first, and nothing moves behind the position
  // until TP1 pays, so a trade that reached +9 and turned round gave all of
  // it back. Not a fitted peak: the whole of sl 20–30 × TP1 20–30 makes 881
  // to 1,173 a month, both halves of the year improve, and the same widening
  // does nothing on 6B, 6N or 6C and hurts 6J — the euro alone was mis-set.
  // The older note, kept because it says what was true: a TP1 of 15 did win
  // three trades in five where 15's neighbours won under one in two. That
  // held the stop still; it is the pair the stop and the target make.
  //
  // 1.11985 → 1.1202 (2026-11-26), after the wider stop moved where the lines
  // belong: +606 on the year, a trade more, the drawdown unmoved, and the
  // year's second half carries all of it. The other seven measured better
  // where they are, two of them markedly so — moving 1.16595 or 1.1683 takes
  // the pair's drawdown to 1,300 and 1,138 for nothing. Read the sweep in the
  // book and not level by level: on its own 1.1597 promised 1,587 more and
  // costs 356 once the others are there, because the one-trade-a-day cap
  // makes a level that looks better steal sessions from a neighbour that did
  // better with them. 1.1202 sits on a plateau (1.1202 to 1.12035 all within
  // 75 of each other), unlike the old 1.11985, which was a one-tick peak
  // under the old stop. Not between 1.1200 and 1.1201: −270 there.
  "6E": { source: "GLBX-20261113-ULHBVEC84B/6e_front_1m.csv", levels: [1.1202, 1.13015, 1.1398, 1.1505, 1.1597, 1.16595, 1.1683, 1.1757], excludeHours: [], tp1s: FX_TP1, pick: { sl: 25, tp1: 30, tp2: 80 } },
  // 6J dropped (2026-11-26). It made 150 a month, 4 % of the book, for 481 of
  // drawdown — on its own more than half the portfolio's 790, which falls to
  // 465 without it. 45 a trade against the book's 106, and the only pair that
  // every widening of the stop makes worse (sl 25 takes it to 106 a month, sl
  // 35 to 75). Three levels, 13 trades each: the yen reacts to them, it just
  // does not pay for the risk of being there. Its source archive and its
  // contract stay, so putting it back is one line.
  // Set for the win rate: TP1 20 wins four trades in five, where 30 wins
  // two in three for 12 a month more.
  "6N": { source: "GLBX-20261113-6B8HPAQ9AC", levels: [0.59885, 0.593, 0.57795, 0.57165, 0.57, 0.56495, 0.55965], excludeHours: [2, 7, 8], tp1s: FX_TP1, pick: { sl: 25, tp1: 20, tp2: 130 } },
  // Added 2026-11-14: levels where the year turned, the ones broken or
  // untouched since May left out. Set for the win rate: TP1 20 wins four
  // trades in five, where 30 wins a little less for 30 a month more.
  "6C": { source: "GLBX-20261114-XT3UQKQJN8", levels: [0.7078, 0.70965, 0.71235, 0.71705, 0.7196, 0.7269, 0.72975], excludeHours: [], tp1s: FX_TP1, pick: { sl: 25, tp1: 20, tp2: 55 } },
  // Added 2026-11-14: the 10-year note, calm (5–10 ticks an hour) and tied to
  // none of the other pairs. Levels where the year turned, the three losing
  // ones left out; TP1 5 on a 12-tick stop wins nearly nine trades in ten.
  ZN: { source: "GLBX-20261114-5455U3L7DB", levels: [104.203125, 104.765625, 105.859375, 106.46875, 107.4375, 108.03125, 108.828125, 109.984375, 111.4375, 112.078125], excludeHours: [], tp1s: [3, 5, 8, 10, 15, 20], pick: { sl: 12, tp1: 5, tp2: 30 } },
  // ZS overshoots its levels before it turns: the order goes seven ticks
  // beyond the level (eight, one tick early as on every pair), and only in the grains' day session —
  // 8h–14h, the hours before it kept out. Under the 15-tick approach rule
  // every stop and TP1 tried there made money, on both parts of the year.
  ZS: { source: "GLBX-20261113-JL6JCCMRCH.zip", levels: [1154.25, 1199, 1229.5, 1294.75, 1329.75], excludeHours: [2, 3, 4, 5, 6, 7], tp1s: GRAIN_TP1, pick: { sl: 12, tp1: 10, tp2: 45 }, offset: -7 },
  // Set by the trader: TP1 at 5 with a 15-tick stop, the runner trailed at
  // 5 — wins five trades in six, where 40 relied on a handful of runs a year.
  ZW: { source: "GLBX-20261113-P985XH3AXW.zip", levels: [505.25, 575, 606.5, 634.5, 680.25, 710.5], excludeHours: [8], tp1s: GRAIN_TP1, pick: { sl: 15, tp1: 5, tp2: 40 } },
};

/** The prop firm's account, MEDIUM: 2,000 trailed at the session's close, five contracts; 500 a day, the trader's own limit (the firm's is 1,000). */
const ACCOUNT: AccountRules = {
  tiers: null, dailyStop: 500, ddLimit: 2000, ddMode: "eod", pairs: 5, safety: 30, maxContracts: 5, maxLossPerTrade: 500,
  // The round trip on one contract, by market.
  fees: { perSide: false, bySymbol: { "6B": 3.22, "6E": 3.22, "6J": 3.22, "6N": 3.22, "6C": 3.22, ZN: 1.52, ZS: 4.12, ZW: 4.12 } },
};

/**
 * A ceiling on one pair's drawdown, off by default.
 *
 * It used to be 850 and it was the wrong instrument. A per-pair cap holds
 * each pair as though their worst stretches fell on the same days, and they
 * do not: the seven pairs draw 3,905 between them and the book draws 638, a
 * sixth of it. So the cap refused configurations the account could carry
 * easily — on 6E it hid the one worth twice the rest — while the only limits
 * that can fail the account, the 2,000 on the whole book and the trader's
 * 500 a day, went unchecked. Those are measured at the end of the run now.
 * PAIR_DD_CAP=850 puts the old ceiling back for a comparison.
 */
const PAIR_DD_CAP = Number(process.env.PAIR_DD_CAP ?? 0) || null;

/** How many other configurations each report shows beside the one it is read with. */
const ALTERNATIVES = 3;

function bars(symbol: string, source: string): Dataset {
  mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, `${symbol}.bin`);
  if (existsSync(cached)) {
    const a = new Float64Array(readFileSync(cached).buffer.slice(0));
    const n = a[0];
    const g = (k: number) => a.slice(1 + k * n, 1 + (k + 1) * n);
    return { symbol, t: g(0), o: g(1), h: g(2), l: g(3), c: g(4), n, from: a[1], to: a[n], importedAt: 0 };
  }
  const full = path.join(DOWNLOADS, source);
  let parts: Dataset[] = [];
  if (source.endsWith(".csv")) parts = parseDatabentoCsv(readFileSync(full, "utf8"), null);
  else if (source.endsWith(".zip")) {
    const list = execFileSync("unzip", ["-Z1", full], { maxBuffer: 1e7 }).toString().split("\n").filter((f) => f.endsWith(".trades.csv")).sort();
    for (const f of list) parts.push(...parseDatabentoCsv(execFileSync("unzip", ["-p", full, f], { maxBuffer: 2e9 }).toString(), null));
  } else
    for (const f of readdirSync(full).filter((f) => f.endsWith(".trades.csv")).sort())
      parts.push(...parseDatabentoCsv(readFileSync(path.join(full, f), "utf8"), null));
  const d = mergeDatasets(parts.filter((p) => p.symbol === symbol));
  const buf = new Float64Array(1 + 5 * d.n);
  buf[0] = d.n;
  [d.t, d.o, d.h, d.l, d.c].forEach((x, k) => buf.set(x, 1 + k * d.n));
  writeFileSync(cached, Buffer.from(buf.buffer));
  return d;
}

(async () => {
  const out: { symbol: string; zones: number[]; result: unknown }[] = [];
  // ONLY=ZS (or ONLY=ZS,6B) runs those pairs alone and keeps the others' results from the file.
  const only = process.env.ONLY ? process.env.ONLY.split(",").map((x) => x.trim()) : null;
  for (const [symbol, pair] of Object.entries(PAIRS)) {
    if (only && !only.includes(symbol)) continue;
    // ADD=ZS:1242.25,1250 tries extra lines on a pair without touching the
    // list above: what a level spotted on the chart would have been worth,
    // answered before it is adopted.
    const extra = (process.env.ADD ?? "")
      .split(";")
      .map((s) => s.split(":"))
      .filter(([s]) => s === symbol)
      .flatMap(([, v]) => (v ?? "").split(",").map(Number).filter((x) => x > 0));
    if (extra.length) pair.levels = [...pair.levels, ...extra].sort((a, b) => a - b);

    // SET=ZS:1199,1229.5,... replaces the list outright, where ADD only grows
    // it. Comparing a whole chart's worth of lines against the current ones
    // needs the two runs to differ by the list and nothing else; adding them
    // one at a time answers a different question, since the one-trade-a-day
    // cap makes levels compete for the same sessions.
    const remplace = (process.env.SET ?? "")
      .split(";")
      .map((s) => s.split(":"))
      .filter(([s]) => s === symbol)
      .flatMap(([, v]) => (v ?? "").split(",").map(Number).filter((x) => x > 0));
    if (remplace.length) pair.levels = [...remplace].sort((a, b) => a - b);
    const d = bars(symbol, pair.source);
    const spec = CONTRACTS[symbol];
    const currencies = newsCurrencies(symbol);
    const events = await getHighImpactBetween(new Date(d.from - 864e5), new Date(d.to + 864e5), currencies);
    if (!events) throw new Error(`${symbol} : le calendrier des news n'a pas pu être lu.`);
    const settings: Settings = {
      lots: 2,
      rearm: 30,
      // MAX_HOURS=24 holds to the 16h Chicago flat instead of the plan's four
      // hours — what an order left to its bracket does when nobody is there
      // to close it.
      maxHours: Number(process.env.MAX_HOURS ?? 4),
      // Enough trades that a configuration cannot rank on trading little.
      minTrades: 20,
      newsWindow: 30,
      // Ten minutes either side of every three-star release of the pair's
      // currencies: as safe as two hours after, and the trades just past
      // them are kept.
      // Price must have come 15 ticks toward the level since the 17:00 open:
      // a session that opened by the level, or beyond it, is passed — a
      // quarter fewer trades, for a lower drawdown and nearly the same profit.
      rules: { ...DEFAULT_RULES, hours: [2, 14], excludeHours: pair.excludeHours, blackout: { before: 10, after: 10, all: true }, minApproach: 15 },
      // Two lots, always. No ceiling on the pair alone: the book's drawdown
      // is what the account lives on, and it is checked once every pair is in.
      ddLimit: PAIR_DD_CAP,
      ddMode: ACCOUNT.ddMode,
      objective: "pnl",
      maxLossPerTrade: ACCOUNT.maxLossPerTrade,
      // Counted the careful way: an order is filled only once price trades a
      // tick past it, as from the back of the queue.
      fill: { through: 1 },
    };
    const grid: Grid = {
      // One tick before the level, unless the pair is known to do better off
      // it (2026-11-15): filled whenever price touches the level, wherever
      // the order is in the queue. On the level, the year made 2,340 to 3,040
      // a month depending on the queue; one tick before, 2,510 to 2,600.
      offsets: [pair.offset ?? 1],
      // 500 at most on a stop at two lots.
      sls: [6, 8, 10, 12, 15, 20, 25, 30].filter((sl) => sl * spec.tickValue * 2 <= 500),
      tp1s: pair.tp1s,
      tp2s: [],
      acts: [],
      dists: [],
      kinds: ["tp1trail"],
      // TRAIL=0.5 trails the runner at half the TP1 instead of a full one.
      // The distance has never been searched: it has always been the TP1
      // itself, which on a winner reaching 1.35 × TP1 — the median — stops the
      // runner out at 0.35 × TP1, under the target the first lot took.
      trailFromTp1: Number(process.env.TRAIL ?? 1),
      newsModes: ["all"],
    };
    const full = await analyse(symbol, d, pair.levels, spec.tickSize, spec.tickValue, grid, settings, () => {}, { events, currencies });
    let r = { ...full, top: full.top.slice(0, ALTERNATIVES + 1) };
    // PICK=12:10:60 runs the pair on that stop, TP1 and TP2 instead of the
    // trader's own, so a single setting can be moved and the rest held still.
    const [ps, pt1, pt2] = (process.env.PICK ?? "").split(":").map(Number);
    const pick = ps > 0 && pt1 > 0 ? { sl: ps, tp1: pt1, tp2: pt2 || undefined } : pair.pick;
    if (pick) {
      // The trader's own setting comes first and is the one the report reads;
      // the search's best three follow, to compare or pick another.
      const mine = await analyse(symbol, d, pair.levels, spec.tickSize, spec.tickValue, { ...grid, sls: [pick.sl], tp1s: [pick.tp1], tp2s: pick.tp2 ? [pick.tp2] : [] }, settings, () => {}, { events, currencies });
      // `unconstrained` has to come from the search, not from this one-config
      // run. The per-pair drawdown cap drops every configuration above it,
      // but a run holding a single configuration finds none left and falls
      // back to the unfiltered list — so the trader's own setting is reported
      // whatever its drawdown, while the alternatives beside it are only the
      // best under the cap. Taking `unconstrained` from `mine` then echoed
      // that same setting, and the one field meant to show what the cap hides
      // showed nothing: on 6E it hid a configuration worth twice as much.
      r = { ...mine, byOffset: full.byOffset, bySl: full.bySl, byTp: full.byTp, byExit: full.byExit, byTrail: full.byTrail, tested: full.tested,
        unconstrained: full.unconstrained,
        top: [mine.top[0], ...full.top.filter((x) => x.key !== mine.top[0].key).slice(0, ALTERNATIVES)] };
    }
    const c = r.top[0];
    console.log(
      `${symbol} ${new Date(d.from).toISOString().slice(0, 10)} → ${new Date(d.to).toISOString().slice(0, 10)} · ${c.n} trades · ${(c.pnl / 12).toFixed(0)} $/mois · DD ${(c.propDD ?? 0).toFixed(0)}`
    );
    out.push({ symbol, zones: pair.levels, result: r });
  }
  // OUT=/chemin/essai.json writes the run elsewhere, to compare a variant
  // without losing the results the journal reads.
  const journal = path.join(process.cwd(), "prisma", "databento-results.json");
  const file = process.env.OUT ?? journal;
  if (only) {
    // The other pairs as they were, in the file's order. A variant run on one
    // pair takes them from the journal's own results, so that OUT= need not
    // point at a file that already exists.
    const from = existsSync(file) ? file : journal;
    const kept = JSON.parse(readFileSync(from, "utf8")) as { symbol: string }[];
    const merged = kept.map((e) => out.find((x) => x.symbol === e.symbol) ?? e);
    for (const x of out) if (!merged.some((e) => e.symbol === x.symbol)) merged.push(x);
    writeFileSync(file, JSON.stringify(merged));
  } else writeFileSync(file, JSON.stringify(out));
  console.log(`${file} : ${(readFileSync(file).length / 1024).toFixed(0)} Ko`);
  carnet(file);
})();

/**
 * What the account would have lived, all the pairs together.
 *
 * Each pair is measured on its own by the search, and a pair's drawdown says
 * nothing about the account's: they draw on different days, so the sum is
 * three to six times what the book actually loses. The two limits that can
 * fail the account are the 2,000 trailed at the close and the trader's 500 a
 * day, and both are properties of the book — so they are read here, off the
 * pairs the file ends up holding, and not pair by pair.
 *
 * Read on the retained configuration of each pair (`top[0]`), at the lots the
 * run used, net of the round trip. A day's profit is credited to the session
 * the trade opened in, as `sessionDay` counts them.
 */
function carnet(file: string) {
  const pairs = JSON.parse(readFileSync(file, "utf8")) as {
    symbol: string;
    result: { tickValue: number; settings?: { lots?: number }; top: { trades: number[][] }[] };
  }[];
  const parJour = new Map<number, number>();
  let trades = 0;
  for (const p of pairs) {
    const t = p.result.top[0];
    if (!t?.trades?.length) continue;
    const lots = p.result.settings?.lots ?? 2;
    const frais = feeRoundTrip(ACCOUNT.fees, p.symbol) * lots;
    for (const tr of t.trades) {
      const jour = sessionDay(tr[0] * 60000);
      parJour.set(jour, (parJour.get(jour) ?? 0) + (tr[1] * p.result.tickValue * lots - frais));
      trades++;
    }
  }
  if (!parJour.size) return;
  // The drawdown as the firm reads it: on the balance at each session's close,
  // never inside the day.
  let eq = 0;
  let haut = 0;
  let dd = 0;
  let pire = 0;
  let depasses = 0;
  for (const jour of [...parJour.keys()].sort((a, b) => a - b)) {
    const p = parJour.get(jour)!;
    if (p < pire) pire = p;
    if (ACCOUNT.dailyStop !== null && p < -ACCOUNT.dailyStop) depasses++;
    eq += p;
    haut = Math.max(haut, eq);
    dd = Math.max(dd, haut - eq);
  }
  // Over the calendar the run covers, not the days it traded: a book that
  // trades 190 days out of a year still earns over twelve months.
  const jours = [...parJour.keys()];
  const mois = Math.max(1, (Math.max(...jours) - Math.min(...jours) + 1) / 30.44);
  const limite = ACCOUNT.ddLimit ?? 0;
  const jourMax = ACCOUNT.dailyStop ?? 0;
  const marque = (v: number, max: number) => (max && v > max ? " ✗ DÉPASSÉ" : max ? ` (sur ${max})` : "");
  console.log(
    `\nCarnet · ${pairs.length} paires · ${trades} trades · ${(eq / mois).toFixed(0)} $/mois net\n` +
      `  drawdown EOD ${dd.toFixed(0)} $${marque(dd, limite)}\n` +
      `  pire journée ${pire.toFixed(0)} $${marque(-pire, jourMax)}` +
      (depasses ? `, ${depasses} journée${depasses > 1 ? "s" : ""} sous la limite du jour` : "")
  );
}
