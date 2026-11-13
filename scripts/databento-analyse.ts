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

/** Where each pair's history is, its levels, the hours (Chicago) it is not traded in, its TP1s to try. */
const PAIRS: Record<string, { source: string; levels: number[]; excludeHours: number[]; tp1s: number[] }> = {
  "6B": { source: "GLBX-20261113-578Q94WBNM/6b_front_1m.csv", levels: [1.3186, 1.3316, 1.3469, 1.3552, 1.3651], excludeHours: [5], tp1s: FX_TP1 },
  "6E": { source: "GLBX-20261113-ULHBVEC84B/6e_front_1m.csv", levels: [1.1187, 1.15065, 1.1591, 1.18435], excludeHours: [5, 6, 9, 11], tp1s: FX_TP1 },
  "6J": { source: "GLBX-20261113-GCPSNPW5BC.zip", levels: [0.006286, 0.0063545, 0.006429, 0.006555], excludeHours: [2, 9, 11], tp1s: FX_TP1 },
  "6N": { source: "GLBX-20261113-6B8HPAQ9AC", levels: [0.60785, 0.59245, 0.57865, 0.5596], excludeHours: [2, 3, 7, 8], tp1s: FX_TP1 },
  // ZS (1153.75 / 1174.75 / 1227.75 / 1293.5) has no configuration with the
  // order on the level that stays under the drawdown cap: left out.
  ZW: { source: "GLBX-20261113-P985XH3AXW.zip", levels: [578.25, 608.5, 634.5, 685, 710.5], excludeHours: [8], tp1s: GRAIN_TP1 },
};

/** The prop firm's account, MEDIUM: 2,000 trailed at the session's close, 1,000 a day, five contracts. */
const ACCOUNT: AccountRules = { tiers: null, dailyStop: 1000, ddLimit: 2000, ddMode: "eod", pairs: 5, safety: 30, maxContracts: 5, maxLossPerTrade: 500 };

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
      maxHours: 4,
      // Enough trades that a configuration cannot rank on trading little.
      minTrades: 20,
      newsWindow: 30,
      rules: { ...DEFAULT_RULES, hours: [2, 14], excludeHours: pair.excludeHours },
      // Two lots, always: each pair's drawdown at that size is capped, so six
      // of them together stay well inside the account's 2,000.
      ddLimit: PAIR_DD_CAP,
      ddMode: ACCOUNT.ddMode,
      objective: "pnl",
      maxLossPerTrade: ACCOUNT.maxLossPerTrade,
    };
    const grid: Grid = {
      offsets: [0],
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
    const r = await analyse(symbol, d, pair.levels, spec.tickSize, spec.tickValue, grid, settings, () => {}, { events, currencies });
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
