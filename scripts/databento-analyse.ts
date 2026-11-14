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
import { analyse, DEFAULT_RULES, type Grid, type Settings } from "@/lib/databento/engine";
import { getHighImpactBetween } from "@/lib/economicCalendar";
import { CONTRACTS, newsCurrencies } from "@/lib/contracts";
import type { AccountRules } from "@/lib/databento/account";

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
// 1227.75 → 1229.75, ZW 608.50 → 606.50; 6B 1.3552 and ZW 685, losing
// wherever they were put, are dropped.
// Added (2026-11-14): 6E 1.16595 and 6N 0.59635, 0.58855, 0.58515, 0.56795 —
// found on the turns of November to May, and as good as the others on the
// six months after.
const PAIRS: Record<string, { source: string; levels: number[]; excludeHours: number[]; tp1s: number[]; pick?: { sl: number; tp1: number }; offset?: number }> = {
  // Set by the trader: 6B only in London's session, 2h–8h — after it, the
  // American session runs the pound through its levels and only 5-tick
  // targets held. On the morning alone a 25-tick stop and a TP1 of 20 make
  // five times as much a trade, on half as many, for a lower drawdown.
  "6B": { source: "GLBX-20261113-578Q94WBNM/6b_front_1m.csv", levels: [1.3186, 1.3316, 1.3477, 1.3651], excludeHours: [8, 9, 10, 11, 12, 13], tp1s: FX_TP1, pick: { sl: 25, tp1: 20 } },
  // Set by the trader: a TP1 of 15 wins three trades in five rather than
  // under one in two, for the same drawdown, and held on the last months —
  // where 30, the most profitable on the year, had stopped working.
  "6E": { source: "GLBX-20261113-ULHBVEC84B/6e_front_1m.csv", levels: [1.1187, 1.15065, 1.1591, 1.16595, 1.18435], excludeHours: [], tp1s: FX_TP1, pick: { sl: 12, tp1: 15 } },
  // Set by the trader: TP1 at 10 with a 15-tick stop, two trades in three won.
  "6J": { source: "GLBX-20261113-GCPSNPW5BC.zip", levels: [0.006286, 0.0063545, 0.006429, 0.006555], excludeHours: [2], tp1s: FX_TP1, pick: { sl: 15, tp1: 10 } },
  // Set for the win rate: TP1 20 wins four trades in five, where 30 wins
  // two in three for 12 a month more.
  "6N": { source: "GLBX-20261113-6B8HPAQ9AC", levels: [0.60785, 0.59635, 0.593, 0.58855, 0.58515, 0.57865, 0.56795, 0.5596], excludeHours: [2, 7, 8], tp1s: FX_TP1, pick: { sl: 25, tp1: 20 } },
  // Added 2026-11-14: levels where the year turned, the ones broken or
  // untouched since May left out. Set for the win rate: TP1 20 wins four
  // trades in five, where 30 wins a little less for 30 a month more.
  "6C": { source: "GLBX-20261114-XT3UQKQJN8", levels: [0.7078, 0.70965, 0.71235, 0.71705, 0.7196, 0.7269, 0.72935], excludeHours: [], tp1s: FX_TP1, pick: { sl: 25, tp1: 20 } },
  // Added 2026-11-14: the 10-year note, calm (5–10 ticks an hour) and tied to
  // none of the other pairs. Levels where the year turned, the three losing
  // ones left out; TP1 5 on a 12-tick stop wins nearly nine trades in ten.
  ZN: { source: "GLBX-20261114-5455U3L7DB", levels: [104.203125, 104.765625, 105.859375, 106.375, 108.828125, 109.390625, 109.859375, 112], excludeHours: [], tp1s: [3, 5, 8, 10, 15, 20], pick: { sl: 12, tp1: 5 } },
  // ZS overshoots its levels before it turns: the order goes eight ticks
  // (two cents) beyond the level, and only in the grains' day session —
  // 8h–14h, the hours before it kept out. Under the 15-tick approach rule
  // every stop and TP1 tried there made money, on both parts of the year.
  ZS: { source: "GLBX-20261113-JL6JCCMRCH.zip", levels: [1153.75, 1174.75, 1229.75, 1293.5], excludeHours: [2, 3, 4, 5, 6, 7], tp1s: GRAIN_TP1, pick: { sl: 12, tp1: 10 }, offset: -8 },
  // Set by the trader: TP1 at 5 with a 15-tick stop, the runner trailed at
  // 5 — wins five trades in six, where 40 relied on a handful of runs a year.
  ZW: { source: "GLBX-20261113-P985XH3AXW.zip", levels: [578.25, 606.5, 634.5, 710.5], excludeHours: [8], tp1s: GRAIN_TP1, pick: { sl: 15, tp1: 5 } },
};

/** The prop firm's account, MEDIUM: 2,000 trailed at the session's close, 1,000 a day, five contracts. */
const ACCOUNT: AccountRules = { tiers: null, dailyStop: 1000, ddLimit: 2000, ddMode: "eod", pairs: 5, safety: 30, maxContracts: 5, maxLossPerTrade: 500 };

/** The most one pair may draw down at two lots. */
const PAIR_DD_CAP = Number(process.env.PAIR_DD_CAP ?? 850);

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
  const out = [];
  for (const [symbol, pair] of Object.entries(PAIRS)) {
    const d = bars(symbol, pair.source);
    const spec = CONTRACTS[symbol];
    const currencies = newsCurrencies(symbol);
    const events = await getHighImpactBetween(new Date(d.from - 864e5), new Date(d.to + 864e5), currencies);
    if (!events) throw new Error(`${symbol} : le calendrier des news n'a pas pu être lu.`);
    const settings: Settings = {
      lots: 2,
      rearm: 30,
      maxHours: 4,
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
      // Two lots, always: each pair's drawdown at that size is capped, so six
      // of them together stay well inside the account's 2,000.
      ddLimit: PAIR_DD_CAP,
      ddMode: ACCOUNT.ddMode,
      objective: "pnl",
      maxLossPerTrade: ACCOUNT.maxLossPerTrade,
    };
    const grid: Grid = {
      // On the level, unless the pair is known to do better off it.
      offsets: [pair.offset ?? 0],
      // 500 at most on a stop at two lots.
      sls: [6, 8, 10, 12, 15, 20, 25, 30].filter((sl) => sl * spec.tickValue * 2 <= 500),
      tp1s: pair.tp1s,
      tp2s: [],
      acts: [],
      dists: [],
      kinds: ["tp1trail"],
      trailFromTp1: 1,
      newsModes: ["all"],
    };
    const full = await analyse(symbol, d, pair.levels, spec.tickSize, spec.tickValue, grid, settings, () => {}, { events, currencies });
    let r = { ...full, top: full.top.slice(0, ALTERNATIVES + 1) };
    if (pair.pick) {
      // The trader's own setting comes first and is the one the report reads;
      // the search's best three follow, to compare or pick another.
      const mine = await analyse(symbol, d, pair.levels, spec.tickSize, spec.tickValue, { ...grid, sls: [pair.pick.sl], tp1s: [pair.pick.tp1] }, settings, () => {}, { events, currencies });
      r = { ...mine, byOffset: full.byOffset, bySl: full.bySl, byTp: full.byTp, byExit: full.byExit, byTrail: full.byTrail, tested: full.tested,
        top: [mine.top[0], ...full.top.filter((x) => x.key !== mine.top[0].key).slice(0, ALTERNATIVES)] };
    }
    const c = r.top[0];
    console.log(
      `${symbol} ${new Date(d.from).toISOString().slice(0, 10)} → ${new Date(d.to).toISOString().slice(0, 10)} · ${c.n} trades · ${(c.pnl / 12).toFixed(0)} $/mois · DD ${(c.propDD ?? 0).toFixed(0)}`
    );
    out.push({ symbol, zones: pair.levels, result: r });
  }
  const file = path.join(process.cwd(), "prisma", "databento-results.json");
  writeFileSync(file, JSON.stringify(out));
  console.log(`${file} : ${(readFileSync(file).length / 1024).toFixed(0)} Ko`);
})();
