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
 * Grains move in bigger steps than currencies: a soybean tick is a quarter of
 * a cent and a day is sixty to eighty of them. Their targets and trails are
 * tried wider; the stop is not, since 500 at two lots is twenty ticks.
 */
const GRAINS: Partial<Grid> = {
  tp1s: [5, 10, 15, 20, 30, 40],
  tp2s: [10, 20, 30, 40, 60, 80],
  acts: [10, 15, 20, 30, 40, 60],
  dists: [5, 10, 15, 20, 30],
};

/** Where each pair's history is, its levels, and the hours (Chicago) it is not traded in. */
const PAIRS: Record<string, { source: string; levels: number[]; excludeHours: number[]; grid?: Partial<Grid> }> = {
  "6B": { source: "GLBX-20261113-578Q94WBNM/6b_front_1m.csv", levels: [1.3186, 1.3316, 1.3469, 1.3552, 1.3651], excludeHours: [5] },
  "6E": { source: "GLBX-20261113-ULHBVEC84B/6e_front_1m.csv", levels: [1.1187, 1.15065, 1.1591, 1.18435], excludeHours: [5, 6, 9, 11] },
  "6J": { source: "GLBX-20261113-GCPSNPW5BC.zip", levels: [0.006286, 0.0063545, 0.006429, 0.006555], excludeHours: [2, 9, 11] },
  "6N": { source: "GLBX-20261113-6B8HPAQ9AC", levels: [0.60785, 0.59245, 0.57865, 0.5596], excludeHours: [2, 3, 7, 8] },
  ZS: { source: "GLBX-20261113-JL6JCCMRCH.zip", levels: [1153.75, 1174.75, 1227.75, 1293.5], excludeHours: [], grid: GRAINS },
  ZW: { source: "GLBX-20261113-P985XH3AXW.zip", levels: [578.25, 608.5, 634.5, 685, 710.5], excludeHours: [8], grid: GRAINS },
};

/** The prop firm's account, MEDIUM: 2,000 trailed at the session's close, 1,000 a day, five contracts. */
const ACCOUNT: AccountRules = { tiers: null, dailyStop: 1000, ddLimit: 2000, ddMode: "eod", pairs: 6, safety: 30, maxContracts: 5, maxLossPerTrade: 500 };

const GRID: Grid = {
  offsets: [-4, -2, 0, 2, 4],
  sls: [6, 8, 10, 12, 15, 20],
  tp1s: [5, 10, 15, 20],
  tp2s: [10, 20, 30, 40],
  acts: [10, 15, 20, 30],
  dists: [5, 10, 15, 20],
  kinds: ["fixed", "trail", "tp1trail"],
  // Not "day": staying out of every session with a high-impact release is
  // half the year, and it only ever won by trading less. The trader's own
  // blackout around the major releases is applied to every configuration.
  newsModes: ["all", "window"],
};

/** The most one pair may draw down at two lots. */
const PAIR_DD_CAP = Number(process.env.PAIR_DD_CAP ?? 850);

/** How many configurations each report keeps: the file goes to the server, over a slow connection. */
const KEEP = 8;

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
      maxHours: 24,
      // Enough trades that a configuration cannot rank on trading little.
      minTrades: 20,
      newsWindow: 30,
      rules: { ...DEFAULT_RULES, excludeHours: pair.excludeHours },
      // Two lots, always: each pair's drawdown at that size is capped, so six
      // of them together stay well inside the account's 2,000.
      ddLimit: PAIR_DD_CAP,
      ddMode: ACCOUNT.ddMode,
      objective: "ratio",
      maxLossPerTrade: ACCOUNT.maxLossPerTrade,
    };
    const r = await analyse(symbol, d, pair.levels, spec.tickSize, spec.tickValue, { ...GRID, ...pair.grid }, settings, () => {}, { events, currencies });
    const c = r.top[0];
    console.log(
      `${symbol} ${new Date(d.from).toISOString().slice(0, 10)} → ${new Date(d.to).toISOString().slice(0, 10)} · ${c.n} trades · ${(c.pnl / 12).toFixed(0)} $/mois · DD ${(c.propDD ?? 0).toFixed(0)}`
    );
    out.push({ symbol, zones: pair.levels, result: { ...r, top: r.top.slice(0, KEEP) } });
  }
  const file = path.join(process.cwd(), "prisma", "databento-results.json");
  writeFileSync(file, JSON.stringify(out));
  console.log(`${file} : ${(readFileSync(file).length / 1024).toFixed(0)} Ko`);
})();
