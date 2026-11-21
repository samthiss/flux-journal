/**
 * The "Trade with Trend" backtest (2026-11-17), run on the trader's machine
 * from the Databento minutes cached by scripts/databento-analyse.ts, written
 * to prisma/trend-results.json for the backtest page.
 *
 * The rule: two sessions in a row closing lower (higher for a long); three
 * M15 swing lows close together, each bounce at least a third of the pair's
 * stop; an H1 close breaks them; price comes back to the zone on M15 and
 * leaves it by a stop, measured from the zone's edge; the second return is
 * sold one tick before the zone, the stop three ticks past its other edge,
 * the target 1.5 times the stop, four hours at most, inside the pair's order
 * hours and not within ten minutes of a three-star release of its
 * currencies. Two lots, the fees taken off. Some pairs keep their own
 * setting (OWN below, the reasons in docs/backtesting.md).
 *
 * Grew out of the tests recorded in docs/backtesting.md: some of the code
 * below (the variant switches) is the tests' and stays for rerunning them.
 *
 *   npx tsx scripts/trend-analyse.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { nextChicagoHour, sessionDay } from "@/lib/databento/engine";

const TF = Number(process.env.TF ?? 60);
const BAR = TF * 60000;
const FEES: Record<string, number> = { "6B": 3.22, "6E": 3.22, "6J": 3.22, "6N": 3.22, "6C": 3.22, ZN: 1.52, ZS: 4.12, ZW: 4.12 };
const res = JSON.parse(readFileSync("prisma/databento-results.json", "utf8")) as { symbol: string; result: { tickSize: number; tickValue: number; top: { cfg: { sl: number; tp1: number; tp2: number; dist: number } }[]; rules: { excludeHours: number[] } } }[];
const ctFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" });
const ctHour = (t: number) => Number(ctFmt.format(t));
const ctMinFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Minutes since midnight, Chicago. */
const ctMinute = (t: number) => { const [h, m] = ctMinFmt.format(t).split(":").map(Number); return h * 60 + m; };

type P = { days: 2 | 3; touches: 2 | 3 | 4; bounce: number; width: number; away: number; stop: "plan" | "zone"; exit: number; entry: "edge" | "mid"; buf: number; mgmt: "fixed" | "be" | "split"; hold: number; wide?: boolean; lots?: number; skipHours?: number[]; ma?: number; maxRun?: number; skipMin?: [number, number]; newsOpen?: boolean; maxVol?: number };
/** Three-star releases of each pair's currencies: no fill from NEWS_MIN minutes before one to NEWS_MIN after — 30 after a year-on-year figure. Loaded by the run that writes the results. */
const NEWS_OF = new Map<string, { at: number; big: boolean }[]>();
const NEWS_MIN = 10;
const inNews = (sym: string, t: number) => (NEWS_OF.get(sym) ?? []).some(({ at, big }) => t >= at - NEWS_MIN * 60000 && t <= at + (big ? 30 : NEWS_MIN) * 60000);
const grid: P[] = [];
for (const entry of ["edge", "mid"] as const) for (const buf of [1, 3, 5]) for (const exit of [1, 1.25, 1.5, 2, 2.5, 3]) for (const mgmt of ["fixed", "be", "split"] as const) for (const hold of [4, 8])
  if (!(exit <= 1 && mgmt !== "fixed")) grid.push({ days: 2, touches: 3, bounce: 0.5, width: 0.5, away: 1, stop: "zone", exit, entry, buf, mgmt, hold });
type Bar = { t: number; o: number; h: number; l: number; c: number; ema: number; i0?: number; i1?: number };
type Data = { sym: string; T: Float64Array; H: Float64Array; L: Float64Array; C: Float64Array; n: number; tick: number; money: number; fee: number; excl: number[]; cfg: { sl: number; tp1: number; tp2: number; dist: number }; mid: number; months: number; hb: Bar[] };
const data: Data[] = res.filter((e) => !process.env.PAIR || e.symbol === process.env.PAIR).map((e) => {
  const r = e.result;
  const a = new Float64Array(readFileSync(path.join(tmpdir(), "flux-databento", `${e.symbol}.bin`)).buffer.slice(0));
  const n = a[0];
  const g = (k: number) => a.slice(1 + k * n, 1 + (k + 1) * n);
  const all = [g(0), g(1), g(2), g(3), g(4)];
  // WEEKS=12: only the last weeks of the history.
  const cut = process.env.WEEKS ? all[0][all[0].length - 1] - Number(process.env.WEEKS) * 7 * 86400000 : 0;
  let s0 = 0;
  while (s0 < all[0].length && all[0][s0] < cut) s0++;
  const [T, O, H, L, C] = all.map((x) => x.subarray(s0));
  const hb: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const hk = Math.floor(T[i] / BAR) * BAR;
    const last = hb[hb.length - 1];
    if (last && last.t === hk) {
      last.h = Math.max(last.h, H[i]);
      last.l = Math.min(last.l, L[i]);
      last.c = C[i];
    } else hb.push({ t: hk, o: O[i], h: H[i], l: L[i], c: C[i], ema: 0 });
  }
  let ema = hb[0].c;
  for (const b of hb) {
    ema += (b.c - ema) * (2 / 51);
    b.ema = ema;
  }
  return { sym: e.symbol, T, H, L, C, n: T.length, tick: r.tickSize, money: r.tickValue * 2, fee: FEES[e.symbol] * 2, excl: r.rules.excludeHours ?? [], cfg: r.top[0].cfg, mid: (T[0] + T[T.length - 1]) / 2, months: (T[T.length - 1] - T[0]) / (30.44 * 86400000), hb };
});

type Zone = { dir: 1 | -1; bottom: number; top: number; ready: number; until: number; touches: number[]; breakT: number; retestT: number; closes: [number, number][]; bounces?: [number, number, number, number][] };

// Bars of any size, from the minutes, kept per pair and size.
const barCache = new Map<string, Bar[]>();
function barsOf(d: Data, tf: number): Bar[] {
  const key = `${d.sym}${tf}`;
  const hit = barCache.get(key);
  if (hit) return hit;
  const size = tf * 60000;
  const out: Bar[] = [];
  for (let i = 0; i < d.n; i++) {
    const k = Math.floor(d.T[i] / size) * size;
    const last = out[out.length - 1];
    if (last && last.t === k) {
      last.h = Math.max(last.h, d.H[i]);
      last.l = Math.min(last.l, d.L[i]);
      last.c = d.C[i];
      last.i1 = i;
    } else out.push({ t: k, o: d.C[i], h: d.H[i], l: d.L[i], c: d.C[i], ema: 0, i0: i, i1: i });
  }
  barCache.set(key, out);
  return out;
}

const ZTF = Number(process.env.ZTF ?? 15), BTF = Number(process.env.BTF ?? 60), RTF = Number(process.env.RTF ?? 15);
/**
 * The zone and its touches on ZTF bars, the break on a BTF close, the first
 * return and the move away on RTF bars.
 */
function zones(d: Data, p: P): Zone[] {
  const zb = barsOf(d, ZTF), bb = barsOf(d, BTF), rb = barsOf(d, RTF);
  const closes = new Map<number, number>();
  for (const x of bb) closes.set(sessionDay(x.t), x.c);
  const days = [...closes.keys()].sort((x, y) => x - y);
  const dayIndex = new Map(days.map((x, i) => [x, i]));
  // The session closes the trend was read from, oldest first: [session day, close].
  const trendSeq = (t: number): [number, number][] => {
    const i = dayIndex.get(sessionDay(t)) ?? 0;
    return days.slice(Math.max(0, i - p.days - 1), i).map((x) => [x, closes.get(x)!]);
  };
  const trendAt = (t: number): 1 | -1 | 0 => {
    const i = dayIndex.get(sessionDay(t)) ?? 0;
    if (i < p.days + 1) return 0;
    const seq = days.slice(i - p.days - 1, i).map((x) => closes.get(x)!);
    let up = true, down = true;
    for (let q = 1; q < seq.length; q++) {
      if (!(seq[q] > seq[q - 1])) up = false;
      if (!(seq[q] < seq[q - 1])) down = false;
    }
    const tr0 = up ? 1 : down ? -1 : 0;
    if (tr0 && p.ma) {
      // The background trend (p.ma): the last close on the trade's side of its exponential average over p.ma sessions.
      const cl = days.slice(0, i).map((x) => closes.get(x)!);
      const from = Math.max(0, cl.length - 3 * p.ma);
      let m = cl[from];
      for (let q = from; q < cl.length; q++) m += (cl[q] - m) * (2 / (p.ma + 1));
      if ((cl[cl.length - 1] < m ? -1 : 1) !== tr0) return 0;
    }
    return tr0;
  };
  const W = Math.max(2, Math.round(d.cfg.sl * p.width)) * d.tick;
  const B = d.cfg.sl * p.bounce * d.tick;
  const away = d.cfg.sl * p.away * d.tick;
  // Swings of one bar each side on the zone's bars, with the time they are known.
  const lows: { i: number; p: number; t: number }[] = [], highs: { i: number; p: number; t: number }[] = [];
  for (let i = 1; i + 1 < zb.length; i++) {
    if (zb[i].l < zb[i - 1].l && zb[i].l <= zb[i + 1].l) lows.push({ i, p: zb[i].l, t: zb[i + 1].t + ZTF * 60000 });
    if (zb[i].h > zb[i - 1].h && zb[i].h >= zb[i + 1].h) highs.push({ i, p: zb[i].h, t: zb[i + 1].t + ZTF * 60000 });
  }
  // A low's (high's) bounce: the bar where price went furthest back from it up to the next low's bar (index `to`), stopping if it traded past it, before the break (`until`); and how far.
  let dirNow = 0;
  const bounceOf = (y: { i: number; p: number }, to: number, until: number): [number, number] => {
    let at = -1, far = 0;
    for (let q = y.i + 1; q <= to && q < zb.length && zb[q].t < until; q++) {
      if (dirNow === -1 ? zb[q].l < y.p - 1e-12 : zb[q].h > y.p + 1e-12) break;
      const v = dirNow === -1 ? zb[q].h - y.p : y.p - zb[q].l;
      if (v > far) { far = v; at = q; }
    }
    return [at, far];
  };
  const out: Zone[] = [];
  // A zone (its side and its low) is traded once: not again while the same one broke less than 5 days ago, the window its bounces are taken from (19.11: it was the whole year).
  const seen = new Map<string, number>();
  const rIndex = (t: number) => {
    let lo = 0, hi = rb.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (rb[m].t < t) lo = m + 1; else hi = m; }
    return lo;
  };
  let lo0 = 0, hi1 = 0, lastTr = 0;
  for (let j = 1; j < bb.length; j++) {
    const b = bb[j];
    const tr = trendAt(b.t);
    if (!tr) continue;
    const src = tr === -1 ? lows : highs;
    dirNow = tr;
    const end = b.t + BTF * 60000;
    if (tr !== lastTr) { lo0 = 0; hi1 = 0; lastTr = tr; }
    while (lo0 < src.length && src[lo0].t <= end - 120 * 3600000) lo0++;
    if (hi1 < lo0) hi1 = lo0;
    while (hi1 < src.length && src[hi1].t <= b.t) hi1++;
    const pts = src.slice(lo0, hi1);
    const prevC = bb[j - 1].c;
    const cands = pts.filter((x) => x.p >= Math.min(b.l, prevC) - W && x.p <= Math.max(b.h, prevC) + W);
    for (const x of cands) {
      const near = pts.filter((y) => Math.abs(y.p - x.p) <= W).sort((u, v) => u.i - v.i);
      // Each low (high) on its own: it counts when price went back at least B from it before the next low in the band, without trading past it first;
      // the latest one, the touch the break comes from, needs no bounce (19.11: each low was judged before on the bounce of the one kept before it).
      const bn = near.map((y, k) => (k === near.length - 1 ? null : bounceOf(y, near[k + 1].i, b.t)));
      const keep = near.map((_, k) => bn[k] === null || bn[k]![1] >= B);
      const cluster = near.filter((_, k) => keep[k]);
      // Each bounce for the justification: [its bar's time, its low (high for a long), when price went furthest back from it, that price]; the last one before the break (0, 0).
      const bounces = near
        .map((y, k): [number, number, number, number] => {
          const v = bn[k];
          return v && v[0] >= 0 ? [zb[y.i].t, y.p, zb[v[0]].t, tr === -1 ? zb[v[0]].h : zb[v[0]].l] : [zb[y.i].t, y.p, 0, 0];
        })
        .filter((_, k) => keep[k]);
      if (cluster.length < p.touches) continue;
      const lo = Math.min(...cluster.map((y) => y.p)), hi = Math.max(...cluster.map((y) => y.p));
      const edge = tr === -1 ? lo : hi;
      const key = `${tr}${Math.round(lo / d.tick)}`;
      if (seen.has(key) && b.t - seen.get(key)! < 120 * 3600000) continue;
      if (tr === -1 ? !(b.c < lo && prevC >= lo) : !(b.c > hi && prevC <= hi)) continue;
      if (p.maxRun) {
        // A zone price already ran far past on the trade's side (p.maxRun stops or more) and came back from: too risky, not traded.
        const first = Math.min(...cluster.map((y) => zb[y.i].t));
        let ex = 0;
        for (let q = j - 1; q >= 0 && bb[q].t >= first; q--) ex = Math.max(ex, tr === -1 ? lo - bb[q].l : bb[q].h - hi);
        if (ex >= p.maxRun * d.cfg.sl * d.tick) continue;
      }
      seen.set(key, b.t);
      // The first return and the move away, on the return's bars, after the breaking bar.
      let k = rIndex(end), touched = -1, ok = false;
      const stopAt = end + 72 * 3600000;
      for (; k < rb.length && rb[k].t < stopAt; k++) {
        if (tr === -1 ? rb[k].c > hi : rb[k].c < lo) break;
        if (touched < 0 && (tr === -1 ? rb[k].h >= edge : rb[k].l <= edge)) touched = k;
        if (touched >= 0 && (tr === -1 ? rb[k].l <= edge - away : rb[k].h >= edge + away)) { ok = true; break; }
      }
      if (!ok) continue;
      const ready = rb[k].t + RTF * 60000;
      out.push({ dir: tr, bottom: edge, top: tr === -1 ? hi : lo, ready, until: Math.min(ready + 48 * 3600000, nextChicagoHour(nextChicagoHour(ready, 14) + 60000, 14)), touches: cluster.map((y) => zb[y.i].t), breakT: b.t, retestT: rb[touched].t, closes: trendSeq(b.t), bounces });
    }
  }
  return out;
}

/**
 * How the market really went, for the trade's justification: the first H1
 * close past the zone's edge since its first bounce (even before the trend
 * was there), and which return to the zone the entry is, counting a return
 * each time price comes back to the edge after moving a stop away from it.
 */
function realReturns(d: Data, x: { t: number; z: Zone }) {
  const dir = x.z.dir, edge = x.z.bottom, stop = d.cfg.sl * d.tick;
  const first = Math.min(...x.z.touches);
  const hb = barsOf(d, 60).find((b) => b.t >= first && b.t + 3600000 <= x.t && (dir === -1 ? b.c < edge : b.c > edge));
  if (!hb) return {};
  let lo = 0, hi = d.n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (d.T[m] < hb.t + 3600000) lo = m + 1; else hi = m; }
  let count = 0, away = false;
  for (let k = lo; k < d.n && d.T[k] <= x.t; k++) {
    if ((dir === -1 ? edge - d.L[k] : d.H[k] - edge) >= stop) away = true;
    if ((dir === -1 ? d.H[k] >= edge : d.L[k] <= edge) && (count === 0 || away)) { count++; away = false; }
  }
  return { rb: Math.round(hb.t / 60000), rn: count };
}

// A pair's volatility now against its usual: the mean session range of the 20 sessions before, over the mean of all the sessions before (19.11).
const VR_CACHE = new Map<string, (t: number) => number>();
function volRatio(d: Data) {
  const got = VR_CACHE.get(d.sym);
  if (got) return got;
  const ses = new Map<number, { h: number; l: number }>();
  for (let i = 0; i < d.n; i++) {
    const k = sessionDay(d.T[i]);
    const x = ses.get(k);
    if (!x) ses.set(k, { h: d.H[i], l: d.L[i] });
    else { x.h = Math.max(x.h, d.H[i]); x.l = Math.min(x.l, d.L[i]); }
  }
  const keys = [...ses.keys()].sort((a, b) => a - b);
  const rng = keys.map((k) => ses.get(k)!.h - ses.get(k)!.l);
  const at = new Map<number, number>();
  let cum = 0;
  for (let i = 0; i < keys.length; i++) {
    if (i >= 20) { let s20 = 0; for (let q = i - 20; q < i; q++) s20 += rng[q]; at.set(keys[i], s20 / 20 / (cum / i)); }
    cum += rng[i];
  }
  const fn = (t: number) => at.get(sessionDay(t)) ?? 1;
  VR_CACHE.set(d.sym, fn);
  return fn;
}

function run(d: Data, p: P) {
  const { T, H, L, C, n, tick } = d;
  const idxAt = (t: number) => {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (T[m] < t) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  const eps = tick * 1e-3;
  const taken = new Set<number>();
  const out: { t: number; pnl: number; r: number; z: Zone; entry: number; sl: number; tp: number; ticks: number; end: number }[] = [];
  // A wide zone only (p.wide): wider than the bounce's distance X, the tighter ones left.
  const X = Math.max(2, Math.round(d.cfg.sl * p.width)) * tick;
  // First the moment each zone's order is reached, then the trades in the order they were filled.
  type Ev = { z: Zone; entry: number; slTicks: number; i: number; kind: "ok" | "skipDay" | "no" | "none" };
  const evs: Ev[] = [];
  for (const z of zones(d, p).sort((x, y) => x.ready - y.ready)) {
    if (p.wide && Math.abs(z.top - z.bottom) <= X + 1e-9) continue;
    // No trade while the pair is far more restless than usual (p.maxVol × its usual session range, at the break).
    if (p.maxVol && volRatio(d)(z.breakT) > p.maxVol) continue;
    const dd = z.dir;
    const raw = p.entry === "edge" ? z.bottom + dd * tick : (z.bottom + z.top) / 2;
    const entry = Math.round(raw / tick) * tick;
    const slTicks = Math.max(4, Math.round(Math.abs(z.top - entry) / tick) + p.buf);
    if (slTicks * d.money > 500) continue;
    let reached = false;
    for (let i = idxAt(z.ready); i < n && T[i] < z.until; i++) {
      if (dd === -1 ? H[i] >= entry + tick - eps : L[i] <= entry - tick + eps) {
        reached = true;
        const h = ctHour(T[i]);
        // A second return in one of the pair's skipped hours (p.skipHours) is not traded, and the pair is done for the day: the market is too restless then.
        if ((p.skipHours ?? []).includes(h)) { evs.push({ z, entry, slTicks, i, kind: "skipDay" }); break; }
        // No fill in the pair's quiet window (p.skipMin, minutes Chicago): the order waits it out, the zone is not dropped.
        if (p.skipMin && ctMinute(T[i]) >= p.skipMin[0] && ctMinute(T[i]) < p.skipMin[1]) continue;
        // A 3* news since 7h CT, while the grains were shut (7h45-8h30) or just before: its move comes at the 8h30 open; no fill before 9h, the order waits (p.newsOpen, 19.11).
        if (p.newsOpen) {
          const mn = ctMinute(T[i]);
          if (mn >= 510 && mn < 540 && (NEWS_OF.get(d.sym) ?? []).some(({ at }) => at <= T[i] && at > T[i] - (mn - 420) * 60000)) continue;
        }
        evs.push({ z, entry, slTicks, i, kind: h >= 2 && h < 14 && !d.excl.includes(h) && !inNews(d.sym, T[i]) ? "ok" : "no" });
        break;
      }
    }
    // Never reached: the order waited until the zone ran out, and kept the pair's place till then.
    if (!reached) evs.push({ z, entry, slTicks, i: Math.min(n - 1, idxAt(z.until)), kind: "none" });
  }
  // One order at a time on a pair, the zone ready first (19.11): a zone whose return comes while an older one's order is
  // still waiting is passed. With an order on every zone, the first filled took the day: when price runs through stacked
  // zones the first is often stopped and the next one wins (60 %, +1 009 $/month instead of 70 %, +1 502).
  const gone = new Set<Ev>();
  const live = (t: number) => {
    let best: Ev | null = null;
    for (const e of evs) if (e.z.ready <= t && T[e.i] >= t && !gone.has(e) && (!best || e.z.ready < best.z.ready)) best = e;
    return best;
  };
  for (const ev of evs.sort((x, y) => x.i - y.i)) {
    const isLive = live(T[ev.i]) === ev;
    gone.add(ev);
    if (!isLive || ev.kind === "none") continue;
    const { z, entry, slTicks } = ev;
    const dd = z.dir;
    const day = sessionDay(T[ev.i]);
    if (ev.kind === "skipDay") { taken.add(day); continue; }
    if (ev.kind === "no" || taken.has(day)) continue;
    const fill = ev.i;
    taken.add(day);
    const against = (j: number, q: number) => (dd === 1 ? L[j] <= q + eps : H[j] >= q - eps);
    const towards = (j: number, q: number) => (dd === 1 ? H[j] >= q - eps : L[j] <= q + eps);
    const ticksAt = (q: number) => (dd * (q - entry)) / tick;
    const limit = Math.min(T[fill] + p.hold * 3600000, nextChicagoHour(T[fill], 16) - 60000);
    const tgt = Math.round(slTicks * p.exit);
    const one = slTicks;
    const tp = entry + dd * tgt * tick, oneR = entry + dd * one * tick;
    let stop = entry - dd * slTicks * tick;
    let ticks: number | null = null;
    let half = false; // split: one lot out at 1R
    if (against(fill, stop)) ticks = -slTicks;
    let j = fill + 1;
    for (; ticks === null && j < n && T[j] <= limit; j++) {
      if (against(j, stop)) { const x = ticksAt(stop); ticks = half ? (one + x) / 2 : x; break; }
      if (p.mgmt !== "fixed" && !half && towards(j, oneR)) {
        stop = entry;
        if (p.mgmt === "split") half = true;
      }
      if (towards(j, tp)) { ticks = half ? (one + tgt) / 2 : tgt; break; }
    }
    // Out on time: at the close of the last minute before the limit, which is when it is shown.
    let timeOut = false;
    if (ticks === null) { const cl = ticksAt(C[Math.min(j, n - 1) - 1]); ticks = half ? (one + cl) / 2 : cl; timeOut = true; }
    // d.money and d.fee are for two lots; a pair traded at one lot (p.lots) takes half of both.
    out.push({ t: T[fill], pnl: (ticks * d.money - d.fee) * ((p.lots ?? 2) / 2), r: ticks / slTicks, z, entry, sl: entry - dd * slTicks * tick, tp, ticks, end: T[Math.min(j, n - 1) - (timeOut ? 1 : 0)] });
  }
  const h1 = out.filter((x) => x.t < d.mid), h2 = out.filter((x) => x.t >= d.mid);
  const sum = (l: typeof out) => l.reduce((acc, x) => acc + x.pnl, 0);
  const w = out.filter((x) => x.pnl > 0), l = out.filter((x) => x.pnl <= 0);
  return { list: out, n: out.length, wins: w.length, gw: sum(w), gl: -sum(l), m1: sum(h1) / (d.months / 2), m2: sum(h2) / (d.months / 2), n1: h1.length, n2: h2.length };
}

if (!process.env.COMBO && !process.env.ONLYTOT && !process.env.DD) (async () => {
  const { getHighImpactBetween } = await import("@/lib/economicCalendar");
  const { newsCurrencies } = await import("@/lib/contracts");
  for (const d of data) {
    const ev = await getHighImpactBetween(new Date(d.T[0] - 864e5), new Date(d.T[d.T.length - 1] + 864e5), newsCurrencies(d.sym));
    if (!ev) throw new Error(`${d.sym} : le calendrier des news n'a pas pu être lu.`);
    NEWS_OF.set(d.sym, ev.map((x) => ({ at: x.at, big: /\byoy\b|y\/y/i.test(x.title) })));
  }
  const base0: P = { days: 2, touches: 3, bounce: 1 / 3, width: 0.5, away: 1, stop: "zone", exit: 1.5, entry: "edge", buf: 3, mgmt: "fixed", hold: 4, maxRun: 6 };
  // A pair's own setting, where one was kept (docs/backtesting.md, 17.11):
  // 6E a longer trend, a wide zone and a nearer target; 6B a shorter move
  // away after the first return and a longer trend (its profit leant on one
  // month, the three sessions win 73 %), 6J a longer move away; ZW a longer trend at one
  // lot, its stop costing 420 $ a trade at two, and a wide zone only (its
  // narrow ones, 8 ticks, lost); ZS not traded on a day its
  // second return comes at 9h CT, just after the grains' day session opens
  // (39 % won there, the drawdown 825 $ instead of 1,491), and its stop two
  // ticks past the zone (64 %, the drawdown 600 $).
  const OWN: Record<string, Partial<P>> = { "6E": { days: 3, exit: 1.25, wide: true, ma: 20, maxVol: 1.4 }, "6B": { away: 0.5, days: 3, skipMin: [450, 480] }, "6J": { away: 1.5, ma: 20 }, ZW: { days: 3, lots: 1, wide: true }, ZS: { skipHours: [9], buf: 2, newsOpen: true } };
  // Pairs taken out of the strategy (docs/backtesting.md, 17.11): 6N and 6C are too slow for the target in their hours, and no setting holds on the second half;
  // ZN made nothing on the first half once the news were kept clear.
  const OUT = ["6N", "6C", "ZN"];
  const pairs = data.filter((d) => !OUT.includes(d.sym)).map((d) => ({ d, p: { ...base0, ...OWN[d.sym] } })).map(({ d, p }) => ({ d, p, list: run(d, p).list })).map(({ d, p, list }) => ({
    symbol: d.sym,
    // The trend's sessions and the target in risks, the pair's own when it has one.
    params: { skipMin: p.skipMin ?? null, newsOpen: !!p.newsOpen, maxVol: p.maxVol ?? 0, maxRun: p.maxRun ?? 0, ma: p.ma ?? 0, buf: p.buf, skipHours: p.skipHours ?? [], lots: p.lots ?? 2, days: p.days, exit: p.exit, away: p.away, bounce: Math.round(p.bounce * 1000) / 1000, wide: !!p.wide, news: NEWS_MIN, sl: d.cfg.sl },
    tick: d.tick,
    from: d.T[0],
    to: d.T[d.T.length - 1],
    // [entry minute, exit minute, dir, zone low, zone high, entry, stop, target, ticks, $ net of fees]
    // Why each trade, in the same order: the trend's closes, the zone's touches, the break, the first return, when the zone was ready.
    why: list.map((x) => ({
      closes: x.z.closes,
      touches: x.z.touches.map((t) => Math.round(t / 60000)),
      brk: Math.round(x.z.breakT / 60000),
      ret: Math.round(x.z.retestT / 60000),
      ready: Math.round(x.z.ready / 60000),
      bounces: (x.z.bounces ?? []).map(([t, p0, pt, pp]) => [Math.round(t / 60000), p0, Math.round(pt / 60000), pp]),
      ...realReturns(d, x),
    })),
    trades: list.map((x) => [
      Math.round(x.t / 60000),
      Math.round(x.end / 60000),
      x.z.dir,
      Math.min(x.z.bottom, x.z.top),
      Math.max(x.z.bottom, x.z.top),
      x.entry,
      x.sl,
      x.tp,
      Math.round(x.ticks * 10) / 10,
      Math.round(x.pnl * 100) / 100,
    ]),
  }));
  const file = path.join(process.cwd(), "prisma", "trend-results.json");
  writeFileSync(file, JSON.stringify({ ranAt: Date.now(), rule: "M15 · H1 · M15", pairs }));
  for (const p of pairs) console.log(`${p.symbol} ${p.trades.length} trades`);
  console.log(`${file} : ${(readFileSync(file).length / 1024).toFixed(0)} Ko`);
  process.exit(0);
})();
if (process.env.COMBO) {
  const base0: P = { days: 2, touches: 3, bounce: 0.5, width: 0.5, away: 1, stop: "zone", exit: 1.5, entry: "edge", buf: 3, mgmt: "fixed", hold: 4 };
  type Tr = { sym: string; t: number; end: number; pnl: number; strat: "N" | "T" };
  const trend: Tr[] = [];
  for (const d of data) for (const x of run(d, base0).list) trend.push({ sym: d.sym, t: x.t, end: x.end, pnl: x.pnl, strat: "T" });
  const levels: Tr[] = [];
  for (const e of res as unknown as { symbol: string; result: { tickValue: number; top: { trades: number[][] }[] } }[]) {
    const money = e.result.tickValue * 2, fee = FEES[e.symbol] * 2;
    for (const row of e.result.top[0].trades) levels.push({ sym: e.symbol, t: row[0] * 60000, end: (row[2] ?? row[0]) * 60000, pnl: row[1] * money - fee, strat: "N" });
  }
  const months = 12;
  const study = (name: string, list: Tr[]) => {
    const tr = [...list].sort((x, y) => x.t - y.t);
    const days = new Map<number, number>();
    const kept: Tr[] = [];
    let cutDay = 0, cutPos = 0;
    for (const x of tr) {
      const sd = sessionDay(x.t);
      const so = days.get(sd) ?? 0;
      if (so <= -500) { cutDay++; continue; }
      // At most 2 positions at once (4 contracts), one a pair.
      const open = kept.filter((y) => y.t <= x.t && y.end > x.t);
      if (open.length >= 2 || open.some((y) => y.sym === x.sym)) { cutPos++; continue; }
      days.set(sd, so + x.pnl);
      kept.push(x);
    }
    let bal = 0, peak = 0, dd = 0, worst = 0;
    for (const sd of [...days.keys()].sort((x, y) => x - y)) {
      const v = days.get(sd)!;
      worst = Math.min(worst, v);
      bal += v;
      dd = Math.max(dd, peak - bal);
      peak = Math.max(peak, bal);
    }
    const nN = kept.filter((x) => x.strat === "N").length, nT = kept.filter((x) => x.strat === "T").length;
    const pN = kept.filter((x) => x.strat === "N").reduce((a, x) => a + x.pnl, 0) / months, pT = kept.filter((x) => x.strat === "T").reduce((a, x) => a + x.pnl, 0) / months;
    const wins = kept.filter((x) => x.pnl > 0).length;
    console.log(`${name.padEnd(34)} ${(kept.length / months).toFixed(1)} tr/mois (niv ${(nN / months).toFixed(1)} + twt ${(nT / months).toFixed(1)}) · ${Math.round((wins / kept.length) * 100)} % · ${Math.round(bal / months)} $/mois (niv ${Math.round(pN)} + twt ${Math.round(pT)}) · DD ${Math.round(dd)} · pire jour ${Math.round(worst)} · ${[...days.values()].filter((v) => v < -500).length} j sous -500 · coupés ${cutPos} (positions) ${cutDay} (jour)`);
  };
  const pick = (syms: string[]) => trend.filter((x) => syms.includes(x.sym));
  study("Niveaux seuls", levels);
  study("TwT 6J+ZN seule", pick(["6J", "ZN"]));
  study("Niveaux + TwT 6J+ZN", [...levels, ...pick(["6J", "ZN"])]);
  study("Niveaux + TwT 6J+ZS+ZN", [...levels, ...pick(["6J", "ZS", "ZN"])]);
  study("Niveaux + TwT 6J", [...levels, ...pick(["6J"])]);
  study("Niveaux + TwT ZN", [...levels, ...pick(["ZN"])]);
  study("Niveaux + TwT 8 paires", [...levels, ...trend]);
  process.exit(0);
}
// The old test reports below run only when asked (ONLYTOT, DD, SYMS): the plain run writes the results above.
if (process.env.ONLYTOT || process.env.DD) {
  const base0: P = { days: 2, touches: 3, bounce: 0.5, width: 0.5, away: 1, stop: "zone", exit: 1.5, entry: "edge", buf: 3, mgmt: "fixed", hold: 4 };
  let a1 = 0, a2 = 0, nn = 0, ww = 0;
  for (const d of data) { const r = run(d, base0); a1 += r.m1; a2 += r.m2; nn += r.n; ww += r.wins; console.log(`${d.sym} ${r.n} tr · ${Math.round((r.wins / r.n) * 100)} % · 1re ${Math.round(r.m1)} · 2e ${Math.round(r.m2)}`); }
  console.log(`STRICT=${process.env.STRICT ?? "non"} TOTAL ${nn} tr · ${Math.round((ww / nn) * 100)} % · 1re ${Math.round(a1)} · 2e ${Math.round(a2)} $/mois`);
  if (process.env.ONLYTOT) process.exit(0);
}
// fmt
import { fmtPrice } from "@/lib/databento/format";
const when = (t: number) => {
  const f = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, ...o }).format(t);
  return `${f("America/Chicago", { weekday: "short", day: "2-digit", month: "2-digit" })} ${f("America/Chicago", { hour: "2-digit", minute: "2-digit" })} CT (${f("Europe/Berlin", { hour: "2-digit", minute: "2-digit" })} BER)`;
};
const base: P = { days: 2, touches: 3, bounce: 0.5, width: 0.5, away: 1, stop: "zone", exit: 1.5, entry: "edge", buf: 3, mgmt: "fixed", hold: 4 };
for (const sym of (process.env.SYMS ?? "").split(",").filter(Boolean)) {
  const d = data.find((x) => x.sym === sym)!;
  const r = run(d, base);
  const px = (v: number) => fmtPrice(v, sym, d.tick);
  const recent = r.list.filter((x) => x.t >= d.mid).slice(-6);
  console.log(`\n===== ${sym} (${r.list.length} trades sur l'an, 2e moitié ci-dessous) =====`);
  for (const x of recent) {
    const side = x.z.dir === -1 ? "SHORT" : "LONG";
    console.log(`${side} ${when(x.t)} · zone ${px(Math.min(x.z.bottom, x.z.top))}–${px(Math.max(x.z.bottom, x.z.top))} (${Math.round(Math.abs(x.z.top - x.z.bottom) / d.tick)} tk)`);
    console.log(`   rebonds : ${x.z.touches.map(when).join(" · ")}`);
    console.log(`   cassure ${when(x.z.breakT)} · 1er retour ${when(x.z.retestT)}`);
    console.log(`   entrée ${px(x.entry)} · SL ${px(x.sl)} (${Math.round(Math.abs(x.entry - x.sl) / d.tick)} tk) · TP ${px(x.tp)} (${Math.round(Math.abs(x.tp - x.entry) / d.tick)} tk) → ${x.ticks >= 0 ? "+" : ""}${Math.round(x.ticks)} tk · ${x.pnl >= 0 ? "+" : ""}${Math.round(x.pnl)} $ · sorti ${when(x.end)}`);
  }
}
