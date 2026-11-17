"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { accentColor, lossColor, winColor } from "@/lib/theme";
import { fmtPrice } from "@/lib/databento/format";
import { chicago, chicagoInstant } from "@/lib/databento/clock";
import { exitAt } from "@/lib/exitTime";
import {
  BLACKOUT_MS,
  DAY_LIMIT,
  MAX_CONTRACTS,
  MAX_POSITIONS,
  OUTCOME_TEXT,
  berClock,
  blocksFor,
  ctClock,
  orderPrices,
  orderWindows,
  parseDay,
  pnlOf,
  windowEndReason,
  type Blocking,
  type Outcome,
  type PairPlan,
} from "@/lib/tradingPlan";
import { addPlanOrder, closePlanOrder, fillPlanOrder, removePlanOrder, setPushPrefs, unfillPlanOrder } from "@/lib/actions/planOrders";
import { addPushDevice, pushPublicKey, removePushDevice, sendTestPush } from "@/lib/actions/reminders";

const ORANGE = accentColor;
const GAIN = winColor;
const LOSS = lossColor;
const BUY = "#4FC3F7";
const SELL = "#E879F9";
const DIM = "#8A8A8A";
const TXT = "#FFF";

export type DayNews = { at: string | null; currency: string; title: string; impact: "high" | "medium" | "low"; kind: "release" | "holiday" };
export type PlanOrderRow = {
  id: string;
  day: string;
  symbol: string;
  side: string;
  level: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  status: string;
  filledAt: string | null;
  outcome: string | null;
  pnl: number | null;
  tradeId: string | null;
  cancelReason: string | null;
};
type Prefs = { exit: boolean; news: boolean; pull: boolean };

// ---- A small store over localStorage: the checklist and the drawdown, kept in the browser ----
const LS_EVENT = "trading-plan-store";
const lsSubscribe = (cb: () => void) => {
  window.addEventListener(LS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
function useLocal(key: string): [string | null, (v: string) => void] {
  const v = useSyncExternalStore(
    lsSubscribe,
    () => window.localStorage.getItem(key),
    () => null
  );
  const set = (next: string) => {
    window.localStorage.setItem(key, next);
    window.dispatchEvent(new Event(LS_EVENT));
  };
  return [v, set];
}

// ---- Web push on this device ----
type Support = "server" | "none" | "ios-browser" | "ok";
const noop = () => () => {};
function support(): Support {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return ios && !window.matchMedia("(display-mode: standalone)").matches ? "ios-browser" : "none";
  }
  return "ok";
}
function toKey(base64: string) {
  const s = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}h`;
const money = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v)).toLocaleString("fr-FR")} $`;
const sideText = (side: string) => (side === "Long" ? "ACHAT" : "VENTE");

/** Today at a Berlin wall-clock time ("05:00"), as an instant; later than now means yesterday's. */
function berlinToday(hhmm: string, now: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(guess);
  const [sh, sm] = shown.split(":").map(Number);
  let t = guess - ((sh * 60 + sm - (h * 60 + m) + 1440) % 1440) * 60000;
  if (t > now + 60000) t -= 86400000;
  return t;
}

function Panel({ title, right, children, style }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ border: "1px solid #2E2E2E", background: "#000", minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "4px 10px", background: "#1A1A1A", color: ORANGE, fontWeight: 700, fontSize: 11, letterSpacing: "0.04em" }}>
        <span>{title}</span>
        {right && <span style={{ color: DIM, fontWeight: 500 }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

const btn = (color: string, filled = false): React.CSSProperties => ({
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 10px",
  border: `1px solid ${color}`,
  background: filled ? color : "transparent",
  color: filled ? "#000" : color,
});
const input: React.CSSProperties = { fontFamily: "inherit", fontSize: 12, background: "#000", color: TXT, border: "1px solid #444", padding: "2px 5px", colorScheme: "dark" };

const CHECKLIST = [
  { id: "news", label: "News 3★ du jour repérées", hint: "Voir « News du jour » : aucun ordre 10 min avant → 10 min après." },
  { id: "night", label: "Niveaux touchés cette nuit vérifiés sur le graphique", hint: "Un niveau touché la nuit, à une heure exclue ou pendant une news ne compte qu'après un éloignement de 30 ticks." },
  { id: "approach", label: "Approche ≥ 15 ticks depuis 17h pour chaque niveau", hint: "Séance ouverte à moins de 15 ticks du niveau : pas d'ordre sur ce niveau." },
  { id: "crossed", label: "Niveaux traversés dans la séance écartés", hint: "Un niveau traversé ne se trade plus dans l'autre sens aujourd'hui." },
  { id: "orders", label: "Ordres limites posés : 2 lots, SL attaché", hint: "Déplie une paire et clique la zone achat ou vente : l'ordre s'ajoute sous le plan." },
  { id: "blackout", label: "Ordres retirés avant chaque blackout et news", hint: "La colonne ÉTAT des ordres posés dit à quelle heure les retirer." },
  { id: "fill", label: "Heure de remplissage notée pour la notification de sortie", hint: "Dans « Ordres du jour » : saisis l'heure puis clique REMPLI." },
];

const PREF_ROWS: [keyof Prefs, string, string][] = [
  ["exit", "Sortie max", "15 min avant puis à la sortie : 4 h après le remplissage, au plus tard 16:00 CT · 23:00 Berlin."],
  ["news", "News 3★", "15 min avant chaque news 3★ des devises de tes paires, pendant tes heures d'ordres."],
  ["pull", "Retrait d'ordre", "1 min avant chaque blackout, news 3★ ou fin des ordres : retire les ordres posés concernés."],
];

export default function TradingPlan({
  day,
  serverNow,
  pairs,
  news,
  newsOk,
  orders,
  prefs,
}: {
  /** The Chicago session date, YYYY-MM-DD. */
  day: string;
  serverNow: number;
  pairs: PairPlan[];
  news: DayNews[];
  newsOk: boolean;
  orders: PlanOrderRow[];
  prefs: Prefs;
}) {
  // ---- The clock, ticking ----
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { time?: string; trail?: string; other?: string }>>({});
  const draft = (id: string) => drafts[id] ?? {};
  const setDraft = (id: string, patch: { time?: string; trail?: string; other?: string }) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const { y, m, d } = parseDay(day);
  const blocking: Blocking[] = useMemo(
    () => news.filter((n) => n.kind === "release" && n.impact === "high" && n.at).map((n) => ({ at: new Date(n.at!).getTime(), currency: n.currency, title: n.title })),
    [news]
  );
  const windows = useMemo(() => Object.fromEntries(pairs.map((p) => [p.symbol, orderWindows(p, day, blocking)])), [pairs, day, blocking]);
  const pairOf = (s: string) => pairs.find((p) => p.symbol === s);
  const px = (v: number, s: string) => fmtPrice(v, s, pairOf(s)?.tick);

  const first = pairs.length ? Math.min(...pairs.map((p) => p.hours[0])) : 2;
  const last = pairs.length ? Math.max(...pairs.map((p) => p.hours[1])) : 14;
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const hourAt = (h: number) => chicagoInstant(y, m, d, h);
  const nowCt = chicago(now);
  const isToday = nowCt.y === y && nowCt.m === m && nowCt.d === d;
  const dateLabel = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).replace(".", "").toUpperCase();

  // ---- Orders ----
  const closedToday = orders.filter((o) => o.status === "closed" && o.day === day);
  const dayPnl = closedToday.reduce((a, o) => a + (o.pnl ?? 0), 0);
  const dayOver = dayPnl <= DAY_LIMIT;
  const live = orders.filter((o) => o.status === "filled");
  const posed = orders.filter((o) => o.status === "pending");
  const contracts = live.reduce((a, o) => a + (pairOf(o.symbol)?.lots ?? 2), 0);
  const worstStop = Math.max(0, ...pairs.map((p) => p.sl * p.tickValue * p.lots));
  const hasOrder = (s: string, level: number, side: string) => orders.some((o) => o.symbol === s && o.side === side && Math.abs(o.level - level) < 1e-9 && o.status !== "cancelled" && o.day === day);

  /** Where a posed order stands: when to pull it, or that it should not be there. */
  const pullOf = (o: PlanOrderRow) => {
    const p = pairOf(o.symbol);
    if (!p) return null;
    const w = windows[o.symbol]?.find(([a, b]) => now >= a && now < b);
    if (w) return { at: w[1] - 60000, why: windowEndReason(p, w[1], day, blocking), next: false };
    const next = windows[o.symbol]?.find(([a]) => a > now);
    return next ? { at: next[0], why: "", next: true } : null;
  };

  // ---- Pairs' status ----
  const statusOf = (s: string) => {
    const w = windows[s] ?? [];
    const cur = w.find(([a, b]) => now >= a && now < b);
    if (cur) return { text: `OUVERT → ${ctClock(cur[1])}`, kind: cur[1] - now <= 15 * 60000 ? "soon" : "open" };
    const next = w.find(([a]) => a > now);
    if (next) return { text: `PAUSE → ${ctClock(next[0])}`, kind: "pause" };
    return { text: "TERMINÉ", kind: "done" };
  };
  const openNow = pairs.filter((p) => statusOf(p.symbol).kind === "open" || statusOf(p.symbol).kind === "soon").length;

  // ---- News ----
  // Which stars the news list shows: the three-star only, or the two-star as well. Kept in the browser.
  const [starsRaw, setStars] = useLocal("trading-plan-news-stars");
  const onlyThree = starsRaw === "3";
  const relevant = news
    .filter((n) => n.kind === "release" && (n.impact === "high" || (!onlyThree && n.impact === "medium")))
    .filter((n) => pairs.some((p) => blocksFor(p.symbol, [{ at: 0, currency: n.currency, title: "" }]).length))
    // The two-star ones once they are out tell nothing more: only the three-star stay all day.
    .filter((n) => n.impact === "high" || !n.at || new Date(n.at).getTime() >= now);
  const pairsHit = (currency: string) => pairs.filter((p) => blocksFor(p.symbol, [{ at: 0, currency, title: "" }]).length).map((p) => p.symbol);
  const whoText = (currency: string) => {
    const hit = pairsHit(currency);
    return hit.length === pairs.length ? "TOUTES TES PAIRES" : hit.join(" · ");
  };
  const nextBlock = blocking.filter((b) => b.at > now).sort((a, b) => a.at - b.at)[0];
  const inHours = (t: number) => t >= hourAt(first) - BLACKOUT_MS && t <= hourAt(last) + BLACKOUT_MS;

  // ---- Summary, worked out from the rules and the day's releases ----
  const summary: React.ReactNode[] = [];
  const dayBlocks = blocking.filter((b) => inHours(b.at));
  if (dayBlocks.length === 0) summary.push(<span key="n">Pas de news 3★ pendant tes heures d&apos;ordres aujourd&apos;hui. </span>);
  for (const b of dayBlocks)
    summary.push(
      <span key={`${b.at}${b.title}`}>
        <span style={{ color: ORANGE, fontWeight: 700 }}>
          {b.currency} {b.title} à {ctClock(b.at)} CT ({berClock(b.at)} Berlin)
        </span>{" "}
        : <span style={{ color: LOSS, fontWeight: 700 }}>pas d&apos;ordre {pairsHit(b.currency).length === pairs.length ? "toutes tes paires" : pairsHit(b.currency).join(" · ")}</span> de {ctClock(b.at - BLACKOUT_MS)} à {ctClock(b.at + BLACKOUT_MS)} CT.{" "}
      </span>
    );
  const shaped = pairs.filter((p) => p.exclude.length);
  if (shaped.length)
    summary.push(
      <span key="h">
        {shaped
          .map((p) => {
            const w = windows[p.symbol] ?? [];
            return `${p.symbol} : ${w.length ? w.map(([a, b]) => `${ctClock(a)}–${ctClock(b)}`).join(", ") : "pas d'ordre"}`;
          })
          .join(" · ")}{" "}
        (CT). Les autres : {hh(first)}–{hh(last)} CT.
      </span>
    );

  // ---- Device and prefs ----
  const sup = useSyncExternalStore(noop, support, () => "server" as Support);
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (sup !== "ok") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setSub(s))
      .catch(() => setSub(null));
  }, [sup]);
  const enable = () =>
    start(async () => {
      try {
        if ((await Notification.requestPermission()) !== "granted") return setMsg("Notifications refusées : autorise-les dans les réglages.");
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(await pushPublicKey()) });
        await addPushDevice(JSON.parse(JSON.stringify(s)));
        setSub(s);
        const n = await sendTestPush();
        setMsg(`Activé · test envoyé à ${n} appareil${n > 1 ? "s" : ""}.`);
      } catch (e) {
        setMsg(`Échec : ${(e as Error).message}`);
      }
    });
  const disable = () =>
    start(async () => {
      if (sub) {
        await removePushDevice(sub.endpoint);
        await sub.unsubscribe();
      }
      setSub(null);
      setMsg("Désactivé sur cet appareil.");
    });

  // ---- Upcoming reminders, as the server will send them ----
  const reminders: { at: number; text: string; color: string }[] = [];
  if (prefs.news)
    for (const b of blocking)
      if (inHours(b.at) && pairsHit(b.currency).length) reminders.push({ at: b.at - 15 * 60000, text: `${b.currency} ${b.title} dans 15 min : retire tes ordres à ${berClock(b.at - BLACKOUT_MS)}`, color: LOSS });
  if (prefs.exit)
    for (const o of live) {
      const end = exitAt(new Date(o.filledAt!).getTime());
      reminders.push({ at: end - 15 * 60000, text: `${o.symbol} ${sideText(o.side).toLowerCase()} : sortie dans 15 min`, color: "#E6E6E6" });
      reminders.push({ at: end, text: `${o.symbol} : SORS MAINTENANT (sortie max)`, color: ORANGE });
    }
  if (prefs.pull)
    for (const o of posed) {
      const pl = pullOf(o);
      if (pl && !pl.next) reminders.push({ at: pl.at, text: `Retire ton ${sideText(o.side).toLowerCase()} ${o.symbol} ${px(o.entry, o.symbol)} (${pl.why})`, color: ORANGE });
    }
  const upcoming = reminders.filter((r) => r.at >= now).sort((a, b) => a.at - b.at);

  // ---- Browser-kept: the checklist and the drawdown ----
  const [checksRaw, setChecks] = useLocal(`trading-plan-checks-${day}`);
  const checks: Record<string, boolean> = checksRaw ? JSON.parse(checksRaw) : {};
  const [ddRaw, setDd] = useLocal("trading-plan-dd");
  const doneCount = CHECKLIST.filter((c) => checks[c.id]).length;

  const alerts: { text: string; red: boolean }[] = [];
  if (dayOver) alerts.push({ text: `JOURNÉE FINIE : ${money(dayPnl)} (limite ${DAY_LIMIT} $). Ferme tout et retire tes ordres, plus aucun trade aujourd'hui.`, red: true });
  else if (dayPnl < 0 && dayPnl - worstStop <= DAY_LIMIT) alerts.push({ text: `Attention : ${money(dayPnl)} aujourd'hui. Un stop de plus peut te faire dépasser ${DAY_LIMIT} $.`, red: false });
  if (live.length > MAX_POSITIONS) alerts.push({ text: `${live.length} positions ouvertes : maximum ${MAX_POSITIONS} en même temps.`, red: true });
  if (contracts > MAX_CONTRACTS) alerts.push({ text: `${contracts} contrats engagés : maximum ${MAX_CONTRACTS}.`, red: true });
  else if (live.length === MAX_POSITIONS && posed.length > 0)
    alerts.push({ text: `${MAX_POSITIONS} positions déjà ouvertes : un ordre de plus rempli dépasserait la limite. Retire les ordres posés restants.`, red: false });

  const kpis = [
    { label: "DD RESTANT", value: ddRaw ? `${Number(ddRaw).toLocaleString("fr-FR")} $` : "—", color: GAIN, sub: "À SAISIR · CLIC POUR MODIFIER", edit: true },
    { label: "P&L DU JOUR", value: money(dayPnl), color: dayPnl > 0 ? GAIN : dayPnl < 0 ? LOSS : "#E6E6E6", sub: dayOver ? "JOURNÉE FINIE" : `RESTE ${Math.round(dayPnl - DAY_LIMIT)} $ AVANT ${DAY_LIMIT}` },
    { label: "TRADES EN COURS", value: `${live.length} / ${MAX_POSITIONS}`, color: live.length > MAX_POSITIONS ? LOSS : "#E6E6E6", sub: `${contracts} / ${MAX_CONTRACTS} CONTRATS · ${posed.length} ORDRE${posed.length > 1 ? "S" : ""} POSÉ${posed.length > 1 ? "S" : ""}` },
    { label: "PAIRES OUVERTES", value: `${openNow} / ${pairs.length}`, color: BUY, sub: isToday ? "SELON LES HORAIRES" : "SÉANCE PAS COMMENCÉE" },
    { label: "PROCHAINE NEWS 3★", value: nextBlock ? ctClock(nextBlock.at) : "—", color: LOSS, sub: nextBlock ? `${nextBlock.currency} ${nextBlock.title}`.toUpperCase().slice(0, 34) : "AUCUNE AUJOURD'HUI" },
    { label: "FENÊTRE", value: `${first}h–${last}h`, color: "#E6E6E6", sub: "CLÔTURE TOUT À 16:00 CT" },
  ];

  const act = (f: () => Promise<unknown>) => start(async () => void (await f()));

  /** What an order's row says, the same on a desk and a phone. */
  const orderView = (o: PlanOrderRow, st: string) => {
    const BADGE: Record<string, [string, React.CSSProperties]> = {
      pending: ["POSÉ", { border: `1px solid ${BUY}`, color: BUY }],
      filled: ["REMPLI", { background: GAIN, color: "#000" }],
      closing: ["SORTIE", { background: ORANGE, color: "#000" }],
      closed: ["CLOS", { border: "1px solid #666", color: "#AAA" }],
      cancelled: ["ANNULÉ", { border: `1px solid ${ORANGE}`, color: ORANGE }],
    };
    let info = "";
    let infoColor = "#A8A8A8";
    let exit: { at: number; left: string; color: string; pct: number; barColor: string; note: string } | null = null;
    if (st === "pending") {
      const pl = pullOf(o);
      if (dayOver) [info, infoColor] = ["Journée finie : retire cet ordre", LOSS];
      else if (pl && !pl.next) [info, infoColor] = [`à retirer à ${ctClock(pl.at)} CT · ${berClock(pl.at)} BER (${pl.why})`, ORANGE];
      else if (pl) [info, infoColor] = [`fenêtre à partir de ${ctClock(pl.at)} CT · ${berClock(pl.at)} BER`, ORANGE];
      else [info, infoColor] = ["hors fenêtre : ne pas laisser posé", LOSS];
    } else if ((st === "filled" || st === "closing") && o.filledAt) {
      const f = new Date(o.filledAt).getTime();
      info = `rempli ${berClock(f)} BER · ${ctClock(f)} CT`;
      const at = exitAt(f);
      const left = Math.round((at - now) / 60000);
      exit = {
        at,
        left: left <= 0 ? "SORS MAINTENANT" : `RESTE ${Math.floor(left / 60)}h${String(left % 60).padStart(2, "0")}`,
        color: left <= 15 ? LOSS : left <= 60 ? ORANGE : GAIN,
        pct: Math.max(0, Math.min(100, ((now - f) / Math.max(1, at - f)) * 100)),
        barColor: left <= 15 ? LOSS : ORANGE,
        note: f + 4 * 3600000 > at ? "Plafonné à 16:00 CT : tout est clôturé à cette heure." : "Notification 15 min avant, puis à l'heure de sortie.",
      };
    } else if (st === "closed" && o.pnl !== null) [info, infoColor] = [money(o.pnl), o.pnl >= 0 ? GAIN : LOSS];
    return { badge: BADGE[st], info, infoColor, exit };
  };
  const outcomeButtons = (p: PairPlan) =>
    [
      ["SL", "STOP", LOSS],
      ["TP1", "TP1 + ENTRÉE", GAIN],
      ...(p.tp2 ? [["TP2", "TP1 + TP2", GAIN]] : []),
    ] as [Outcome, string, string][];
  const fillOrder = (o: PlanOrderRow) => {
    const t = draft(o.id).time ? berlinToday(draft(o.id).time!, Date.now()) : Date.now();
    act(() => fillPlanOrder(o.id, new Date(t).toISOString()));
  };
  const deviceControls = (
    <>
      {sup === "server" && <span style={{ color: DIM }}>…</span>}
      {sup === "ios-browser" && (
        <span style={{ color: "#CCC", lineHeight: 1.6 }}>
          Sur iPhone : <b>Partager</b> → <b>Sur l&apos;écran d&apos;accueil</b>, ouvre le journal depuis l&apos;icône, puis reviens ici.
        </span>
      )}
      {sup === "none" && <span style={{ color: LOSS }}>Ce navigateur ne reçoit pas de notifications.</span>}
      {sup === "ok" && sub === null && (
        <button type="button" disabled={pending} onClick={enable} style={{ ...btn(ORANGE, true), flex: 1, padding: "8px" }}>
          ACTIVER SUR CET APPAREIL
        </button>
      )}
      {sup === "ok" && sub && (
        <>
          <span style={{ color: GAIN, fontWeight: 700, flex: 1 }}>● ACTIVÉ</span>
          <button type="button" disabled={pending} onClick={() => act(async () => setMsg(`Test envoyé à ${await sendTestPush()} appareil(s).`))} style={btn(ORANGE)}>
            TESTER
          </button>
          <button type="button" disabled={pending} onClick={disable} style={btn("#999")}>
            DÉSACTIVER
          </button>
        </>
      )}
      {msg && <span style={{ color: DIM, width: "100%" }}>{msg}</span>}
    </>
  );

  return (
    <>
    <style>{`.tp-mob{display:none}@media (max-width:760px){.tp-desk{display:none!important}.tp-mob{display:flex!important}}`}</style>
    <div className="tp-desk" style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8, color: "#E6E6E6" }}>
      {/* ---- Command strip ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", background: ORANGE, color: "#000", fontWeight: 700, fontSize: 12 }}>
        <span style={{ padding: "5px 12px", background: "#000", color: ORANGE }}>FLUX</span>
        <span style={{ padding: "5px 12px", borderRight: "1px solid #000" }}>PLAN &lt;GO&gt;</span>
        <span style={{ padding: "5px 12px" }}>TRADING PLAN · {dateLabel}</span>
        <span style={{ padding: "5px 12px", marginLeft: "auto" }}>MODE MANUEL · SANS FLUX DE PRIX</span>
        <span style={{ padding: "5px 12px", background: "#000", color: ORANGE }}>
          CT {ctClock(now)} · BER {berClock(now)}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid #2E2E2E", fontSize: 12, fontWeight: 700 }}>
        <span style={{ padding: "6px 12px", background: ORANGE, color: "#000" }}>F1 PLAN DU JOUR</span>
        <Link href="/backtesting-databento" style={{ padding: "6px 12px", color: "#CCC", textDecoration: "none", borderRight: "1px solid #1A1A1A" }}>
          <span style={{ color: ORANGE }}>F2</span> BACKTEST
        </Link>
        <span style={{ padding: "6px 12px", marginLeft: "auto", color: DIM, fontWeight: 500 }}>PLAN CALCULÉ À PARTIR DE TES RÈGLES ET DES NEWS</span>
      </div>

      {/* ---- KPIs ---- */}
      <div style={{ border: "1px solid #2E2E2E", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            onClick={
              k.edit
                ? () => {
                    const v = window.prompt("Drawdown restant sur le compte, en $ (lu sur LMI) :", ddRaw ?? "");
                    if (v !== null && v.trim() !== "" && Number.isFinite(Number(v.replace(/\s/g, "").replace(",", ".")))) setDd(String(Number(v.replace(/\s/g, "").replace(",", "."))));
                  }
                : undefined
            }
            style={{ padding: "8px 12px", borderRight: "1px solid #2E2E2E", cursor: k.edit ? "pointer" : "default" }}
          >
            <div style={{ color: ORANGE, fontSize: 10.5, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1.3 }}>{k.value}</div>
            <div style={{ color: DIM, fontSize: 10.5 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ---- Summary ---- */}
      <Panel title="◆ RÉSUMÉ DU JOUR" right="SANS PRIX EN DIRECT" style={{ borderColor: "#4A3410" }}>
        <div style={{ padding: "10px 12px", lineHeight: 1.65, fontSize: 13, color: "#F0F0F0" }}>
          {summary}
          <br />
          <span style={{ color: ORANGE }}>À faire toi-même :</span> sans flux de prix, l&apos;appli ne voit pas quels niveaux ont été touchés cette nuit ni l&apos;approche depuis 17h. Vérifie-les sur ton graphique avant de poser tes ordres (checklist à droite).
        </div>
      </Panel>

      {/* ---- Two columns: hours, plan and orders; news, checklist and notifications ---- */}
      <div className="term-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <Panel title={`HORAIRES DU JOUR · ${dateLabel.slice(0, 9)}`} right={`FIN DES ORDRES ${hh(last)} CT · ${berClock(hourAt(last)).slice(0, 2)}H BERLIN`}>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 640, padding: "8px 10px 10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: `52px repeat(${hours.length}, minmax(0, 1fr))`, gap: 3, fontSize: 11 }}>
                  <span style={{ color: DIM }}>CT</span>
                  {hours.map((h) => {
                    const cur = isToday && nowCt.h === h;
                    return (
                      <span key={`c${h}`} style={{ textAlign: "center", fontWeight: 700, color: cur ? "#000" : ORANGE, background: cur ? ORANGE : "none" }}>
                        {hh(h)}
                      </span>
                    );
                  })}
                  <span style={{ color: DIM }}>BERLIN</span>
                  {hours.map((h) => (
                    <span key={`b${h}`} style={{ textAlign: "center", color: DIM }}>
                      {berClock(hourAt(h)).slice(0, 2)}h
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                  {pairs.map((p) => (
                    <div key={p.symbol} style={{ display: "grid", gridTemplateColumns: `52px repeat(${hours.length}, minmax(0, 1fr))`, gap: 3 }}>
                      <span style={{ color: TXT, fontWeight: 700, alignSelf: "center" }}>{p.symbol}</span>
                      {hours.map((h) => {
                        const blocked = h < p.hours[0] || h >= p.hours[1] || p.exclude.includes(h);
                        const hit = blocksFor(p.symbol, blocking).filter((b) => b.at + BLACKOUT_MS > hourAt(h) && b.at - BLACKOUT_MS < hourAt(h + 1));
                        const cur = isToday && nowCt.h === h;
                        const past = isToday && h < nowCt.h;
                        return (
                          <span
                            key={h}
                            title={`${p.symbol} · ${hh(h)} CT / ${berClock(hourAt(h)).slice(0, 2)}h Berlin : ${blocked ? "pas de nouvel ordre" : hit.length ? `ordres permis sauf ${hit.map((b) => `${ctClock(b.at - BLACKOUT_MS)}–${ctClock(b.at + BLACKOUT_MS)} (${b.currency} ${b.title})`).join(", ")}` : "ordres permis"}`}
                            style={{
                              height: 16,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 700,
                              color: LOSS,
                              background: blocked ? "#161616" : "#123A22",
                              borderTop: blocked ? "none" : `1px solid ${GAIN}`,
                              outline: cur ? `1px solid ${ORANGE}` : "none",
                              outlineOffset: -1,
                              opacity: past ? 0.45 : 1,
                            }}
                          >
                            {!blocked && hit.length ? "N" : ""}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 10, fontSize: 11, color: "#A8A8A8" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 14, height: 10, background: "#123A22", borderTop: `1px solid ${GAIN}` }} />
                    ORDRES PERMIS
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 14, height: 10, background: "#161616" }} />
                    PAS DE NOUVEL ORDRE
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: LOSS, fontWeight: 700 }}>N</span>NEWS 3★ : AUCUN ORDRE 10 MIN AVANT → 10 MIN APRÈS
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 14, height: 10, border: `1px solid ${ORANGE}` }} />
                    HEURE EN COURS
                  </span>
                </div>
                <div style={{ marginTop: 10, borderTop: "1px solid #1A1A1A" }}>
                  <button
                    type="button"
                    onClick={() => setWhyOpen((v) => !v)}
                    aria-expanded={whyOpen}
                    style={{ cursor: "pointer", background: "none", border: 0, fontFamily: "inherit", display: "flex", gap: 8, padding: "8px 0 4px", fontSize: 11, fontWeight: 700, color: ORANGE }}
                  >
                    <span>{whyOpen ? "▾" : "▸"}</span>
                    <span>POURQUOI CES HORAIRES</span>
                  </button>
                  {whyOpen && (
                    <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "#A8A8A8", padding: "2px 0 2px 16px" }}>
                      <div style={{ color: DIM, marginBottom: 2 }}>Un trade rempli avant une heure grise se gère jusqu&apos;au bout (SL, TP1, trailing, 4 h max).</div>
                      {pairs
                        .filter((p) => p.why)
                        .map((p) => (
                          <div key={p.symbol}>
                            <span style={{ color: TXT, fontWeight: 700 }}>{p.symbol}</span> · {p.why}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
          <Panel title="PLAN PAR PAIRE · FENÊTRES ET NIVEAUX" right="CLIC = PRIX D'ORDRE PAR NIVEAU">
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 760 }}>
                <div style={{ display: "grid", gridTemplateColumns: "48px 140px 1fr 64px 80px 80px", gap: 8, padding: "5px 10px", color: DIM, fontSize: 10.5, borderBottom: "1px solid #2E2E2E" }}>
                  <span>PAIRE</span>
                  <span>STATUT</span>
                  <span>FENÊTRES D&apos;ORDRES (CT)</span>
                  <span style={{ textAlign: "right" }}>STOP</span>
                  <span style={{ textAlign: "right" }}>TP1→TP2</span>
                  <span style={{ textAlign: "right" }}>NIVEAUX</span>
                </div>
                {pairs.map((p) => {
                  const st = statusOf(p.symbol);
                  const on = open === p.symbol;
                  const w = windows[p.symbol] ?? [];
                  const stStyle: React.CSSProperties =
                    st.kind === "pause"
                      ? { border: `1px solid ${ORANGE}`, color: ORANGE }
                      : st.kind === "done"
                        ? { border: "1px solid #444", color: "#777" }
                        : { background: st.kind === "soon" ? ORANGE : GAIN, color: "#000" };
                  return (
                    <div key={p.symbol} style={{ borderBottom: "1px solid #1A1A1A" }}>
                      <button
                        type="button"
                        onClick={() => setOpen(on ? null : p.symbol)}
                        aria-expanded={on}
                        className="term-row"
                        style={{
                          cursor: "pointer",
                          display: "grid",
                          gridTemplateColumns: "48px 140px 1fr 64px 80px 80px",
                          gap: 8,
                          alignItems: "center",
                          width: "100%",
                          textAlign: "left",
                          padding: "5px 10px",
                          border: 0,
                          fontFamily: "inherit",
                          fontSize: "inherit",
                          color: "inherit",
                          background: on ? "#1F1608" : "transparent",
                          boxShadow: on ? `inset 3px 0 0 ${ORANGE}` : "none",
                          opacity: st.kind === "done" ? 0.6 : 1,
                        }}
                      >
                        <span style={{ color: TXT, fontWeight: 700 }}>
                          {on ? "▾" : "▸"} {p.symbol}
                        </span>
                        <span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", ...stStyle }}>{st.text}</span>
                        </span>
                        <span>{w.length ? w.map(([a, b]) => `${ctClock(a)}–${ctClock(b)}`).join(" · ") : "aucune"}</span>
                        <span style={{ textAlign: "right", color: LOSS }}>{p.sl} TK</span>
                        <span style={{ textAlign: "right", color: GAIN }}>
                          {p.tp1}→{p.tp2 ?? "trail"}
                        </span>
                        <span style={{ textAlign: "right", color: DIM }}>{p.levels.length}</span>
                      </button>
                      {on && (
                        <div style={{ padding: "2px 10px 10px 50px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) 12px minmax(0, 1fr)", gap: 8, padding: "5px 0", color: DIM, fontSize: 10.5, borderBottom: "1px solid #2E2E2E" }}>
                            <span>NIVEAU</span>
                            <span style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, padding: "0 6px", textAlign: "right" }}>
                              <span style={{ color: BUY }}>ACHAT</span>
                              <span>SL</span>
                              <span>TP1</span>
                              <span>TP2</span>
                            </span>
                            <span />
                            <span style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, padding: "0 6px", textAlign: "right" }}>
                              <span style={{ color: SELL }}>VENTE</span>
                              <span>SL</span>
                              <span>TP1</span>
                              <span>TP2</span>
                            </span>
                          </div>
                          {p.levels.map((L) => {
                            const o = orderPrices(p, L);
                            const zone = (side: "Long" | "Short") => {
                              const q = side === "Long" ? o.buy : o.sell;
                              const has = hasOrder(p.symbol, L, side);
                              const c = side === "Long" ? BUY : SELL;
                              return (
                                <button
                                  type="button"
                                  disabled={pending || has}
                                  onClick={() => act(() => addPlanOrder(day, p.symbol, L, side))}
                                  title={has ? "Ordre déjà ajouté" : `Ajouter cet ordre ${side === "Long" ? "d'achat" : "de vente"}`}
                                  aria-label={`${side === "Long" ? "Achat" : "Vente"} ${p.symbol} à ${px(q.entry, p.symbol)}`}
                                  className="plan-zone"
                                  data-side={side}
                                  style={{
                                    cursor: has ? "default" : "pointer",
                                    display: "grid",
                                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                    gap: 8,
                                    padding: "3px 6px",
                                    fontFamily: "inherit",
                                    fontSize: "inherit",
                                    color: "inherit",
                                    textAlign: "right",
                                    border: has ? `1px solid ${c}` : "1px dashed transparent",
                                    background: has ? `${c}1A` : "transparent",
                                  }}
                                >
                                  <span style={{ color: TXT }}>{px(q.entry, p.symbol)}</span>
                                  <span style={{ color: LOSS }}>{px(q.sl, p.symbol)}</span>
                                  <span style={{ color: GAIN }}>{px(q.tp1, p.symbol)}</span>
                                  <span style={{ color: GAIN }}>{q.tp2 ? px(q.tp2, p.symbol) : "—"}</span>
                                </button>
                              );
                            };
                            return (
                              <div key={L} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) 12px minmax(0, 1fr)", gap: 8, alignItems: "center", padding: "2px 0" }}>
                                <span style={{ color: TXT, fontWeight: 700 }}>{px(L, p.symbol)}</span>
                                {zone("Long")}
                                <span />
                                {zone("Short")}
                              </div>
                            );
                          })}
                          <div style={{ color: DIM, fontSize: 11, marginTop: 6 }}>
                            Achat si le prix descend sur le niveau, vente s&apos;il monte dessus · entrée{" "}
                            {p.offset >= 0 ? `${p.offset} tick avant le` : `${-p.offset} ticks au-delà du`} niveau · 2 lots, TP1 sur 1 lot, runner en trailing.{" "}
                            <span style={{ color: ORANGE }}>Clique une zone achat ou vente pour créer l&apos;ordre.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel
            title="ORDRES DU JOUR"
            right={
              orders.length
                ? `${posed.length} POSÉ${posed.length > 1 ? "S" : ""} · ${live.length} EN COURS · ${closedToday.length} CLOS · P&L ${money(dayPnl)}`
                : "CLIC SUR UNE ZONE = NOUVEL ORDRE"
            }
          >
            {alerts.map((a) => (
              <div
                key={a.text}
                style={{ padding: "7px 10px", fontWeight: 700, fontSize: 12, borderBottom: "1px solid #2E2E2E", background: a.red ? "#3A0D0D" : "#1F1608", color: a.red ? "#FF6B6B" : ORANGE }}
              >
                {a.text}
              </div>
            ))}
            {orders.length === 0 ? (
              <div style={{ color: DIM, padding: "14px 10px", lineHeight: 1.6 }}>
                Aucun ordre pour l&apos;instant. Déplie une paire dans le plan ci-dessus et clique une <span style={{ color: BUY }}>zone d&apos;achat</span> ou de{" "}
                <span style={{ color: SELL }}>vente</span> pour l&apos;ajouter ici.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "40px 58px 84px 84px 84px 84px 84px 1fr", gap: 8, padding: "5px 10px", color: DIM, fontSize: 10.5, borderBottom: "1px solid #2E2E2E" }}>
                    <span>PAIRE</span>
                    <span>SENS</span>
                    <span style={{ textAlign: "right" }}>NIVEAU</span>
                    <span style={{ textAlign: "right" }}>ENTRÉE</span>
                    <span style={{ textAlign: "right" }}>SL</span>
                    <span style={{ textAlign: "right" }}>TP1</span>
                    <span style={{ textAlign: "right" }}>TP2</span>
                    <span style={{ paddingLeft: 12 }}>ÉTAT</span>
                  </div>
                  {orders.map((o) => {
                    const p = pairOf(o.symbol);
                    const st = closing === o.id && o.status === "filled" ? "closing" : o.status;
                    const v = orderView(o, st);
                    return (
                      <div
                        key={o.id}
                        style={{
                          borderBottom: "1px solid #1A1A1A",
                          opacity: st === "closed" || st === "cancelled" ? 0.7 : 1,
                          boxShadow: st === "closed" || st === "cancelled" ? "none" : `inset 3px 0 0 ${st === "pending" ? BUY : GAIN}`,
                        }}
                      >
                        <div style={{ display: "grid", gridTemplateColumns: "40px 58px 84px 84px 84px 84px 84px 1fr", gap: 8, padding: "5px 10px", alignItems: "center" }}>
                          <span style={{ color: TXT, fontWeight: 700 }}>{o.symbol}</span>
                          <span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", background: o.side === "Long" ? BUY : SELL, color: "#000" }}>{sideText(o.side)}</span>
                          </span>
                          <span style={{ textAlign: "right" }}>{px(o.level, o.symbol)}</span>
                          <span style={{ textAlign: "right", color: TXT, fontWeight: 700 }}>{px(o.entry, o.symbol)}</span>
                          <span style={{ textAlign: "right", color: LOSS }}>{px(o.sl, o.symbol)}</span>
                          <span style={{ textAlign: "right", color: GAIN }}>{px(o.tp1, o.symbol)}</span>
                          <span style={{ textAlign: "right", color: GAIN }}>{o.tp2 !== null ? px(o.tp2, o.symbol) : "—"}</span>
                          <span style={{ paddingLeft: 12, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", ...v.badge[1] }}>{v.badge[0]}</span>
                            <span style={{ fontSize: 11.5, color: v.infoColor }}>{v.info}</span>
                          </span>
                        </div>

                        {st === "pending" && (
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "0 10px 8px 108px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: DIM }}>
                              REMPLI À (BER)
                              <input type="time" value={draft(o.id).time ?? ""} onChange={(e) => setDraft(o.id, { time: e.target.value })} style={input} />
                            </label>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => fillOrder(o)}
                              style={btn(ORANGE, true)}
                            >
                              REMPLI
                            </button>
                            <button type="button" disabled={pending} onClick={() => act(() => removePlanOrder(o.id))} style={btn("#999")}>
                              ANNULER
                            </button>
                            <span style={{ color: DIM, fontSize: 10.5 }}>vide = maintenant</span>
                          </div>
                        )}

                        {st === "filled" &&
                          o.filledAt &&
                          (() => {
                            const f = new Date(o.filledAt).getTime();
                            const exit = exitAt(f);
                            const left = Math.round((exit - now) / 60000);
                            const pct = Math.max(0, Math.min(100, ((now - f) / Math.max(1, exit - f)) * 100));
                            const color = left <= 15 ? LOSS : left <= 60 ? ORANGE : GAIN;
                            return (
                              <div style={{ padding: "0 10px 8px 108px" }}>
                                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                                  <span style={{ fontSize: 11, color: "#A8A8A8" }}>
                                    SORTIE MAX <span style={{ color: ORANGE, fontWeight: 700 }}>{berClock(exit)}</span> BER · {ctClock(exit)} CT
                                  </span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color }}>{left <= 0 ? "SORS MAINTENANT" : `RESTE ${Math.floor(left / 60)}h${String(left % 60).padStart(2, "0")}`}</span>
                                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                    <button type="button" disabled={pending} onClick={() => act(() => unfillPlanOrder(o.id))} style={btn("#777")}>
                                      PAS REMPLI
                                    </button>
                                    <button type="button" onClick={() => setClosing(o.id)} style={btn(ORANGE)}>
                                      SORTI…
                                    </button>
                                  </span>
                                </div>
                                <div style={{ height: 5, background: "#1A1A1A", marginTop: 5 }}>
                                  <div style={{ height: "100%", width: `${pct.toFixed(0)}%`, background: left <= 15 ? LOSS : ORANGE }} />
                                </div>
                                <div style={{ color: DIM, fontSize: 10.5, marginTop: 3 }}>
                                  {f + 4 * 3600000 > exit ? "Plafonné à 16:00 CT : tout est clôturé à cette heure." : "Notification 15 min avant, puis à l'heure de sortie."}
                                </div>
                              </div>
                            );
                          })()}

                        {st === "closing" && p && (
                          <div style={{ padding: "6px 10px 10px 108px", background: "#0D0D0D" }}>
                            <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, marginBottom: 6 }}>COMMENT S&apos;EST TERMINÉ LE TRADE ? (P&amp;L À {p.lots} LOTS)</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                              {outcomeButtons(p).map(([k, label, c]) => (
                                <button key={k} type="button" disabled={pending} onClick={() => act(() => closePlanOrder(o.id, k, 0).then(() => setClosing(null)))} style={{ ...btn(c), fontSize: 11.5, padding: "4px 10px" }}>
                                  {label} <span style={{ opacity: 0.8 }}>{money(pnlOf(p, k))}</span>
                                </button>
                              ))}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 8 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#A8A8A8" }}>
                                TP1 + TRAILING, RUNNER +
                                <input type="number" value={draft(o.id).trail ?? ""} onChange={(e) => setDraft(o.id, { trail: e.target.value })} style={{ ...input, width: 54 }} /> TICKS
                              </label>
                              <button type="button" disabled={pending} onClick={() => act(() => closePlanOrder(o.id, "TRAIL", Number(draft(o.id).trail) || 0).then(() => setClosing(null)))} style={btn(GAIN)}>
                                OK
                              </button>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#A8A8A8" }}>
                                DURÉE MAX / AUTRE
                                <input type="number" value={draft(o.id).other ?? ""} onChange={(e) => setDraft(o.id, { other: e.target.value })} placeholder="$" style={{ ...input, width: 70 }} /> $
                              </label>
                              <button type="button" disabled={pending} onClick={() => act(() => closePlanOrder(o.id, "TIME", Number(draft(o.id).other) || 0).then(() => setClosing(null)))} style={btn("#E6E6E6")}>
                                OK
                              </button>
                              <button type="button" onClick={() => setClosing(null)} style={{ ...btn("#999"), marginLeft: "auto" }}>
                                RETOUR
                              </button>
                            </div>
                          </div>
                        )}

                        {st === "closed" && (
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "0 10px 8px 108px", fontSize: 11.5 }}>
                            <span style={{ color: "#A8A8A8" }}>
                              {OUTCOME_TEXT[(o.outcome ?? "TIME") as Outcome]}
                              {o.filledAt ? ` · rempli ${berClock(new Date(o.filledAt).getTime())} BER` : ""} · P&amp;L {money(o.pnl ?? 0)}
                            </span>
                            {o.tradeId && (
                              <Link href={`/trades/${o.tradeId}`} style={{ color: BUY, textDecoration: "none" }}>
                                ✓ Ajouté à tes Trades →
                              </Link>
                            )}
                          </div>
                        )}

                        {st === "cancelled" && (
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "0 10px 8px 108px", fontSize: 11.5 }}>
                            <span style={{ color: ORANGE }}>{o.cancelReason}</span>
                            <button type="button" disabled={pending} onClick={() => act(() => removePlanOrder(o.id))} style={btn("#999")}>
                              RETIRER DE LA LISTE
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <Panel title="NEWS DU JOUR" right={<StarFilter onlyThree={onlyThree} set={(v) => setStars(v ? "3" : "23")} />}>
            <div style={{ display: "grid", gridTemplateColumns: "44px 44px 36px 1fr 36px", gap: 8, padding: "5px 10px", color: DIM, fontSize: 10.5, borderBottom: "1px solid #2E2E2E" }}>
              <span>CT</span>
              <span>BER</span>
              <span>DEV</span>
              <span>ÉVÉNEMENT</span>
              <span>IMP</span>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {!newsOk && <div style={{ padding: "10px", color: DIM }}>Le flux des news n&apos;a pas répondu — il sera relu dans l&apos;heure.</div>}
            {newsOk && relevant.length === 0 && <div style={{ padding: "10px", color: DIM }}>{onlyThree ? "Aucune news 3★ pour tes paires ce jour-là." : "Aucune news 3★, ni 2★ à venir, pour tes paires ce jour-là."}</div>}
            {relevant.map((n, i) => {
              const t = n.at ? new Date(n.at).getTime() : null;
              const block = n.impact === "high" && t !== null;
              const past = t !== null && t < now;
              return (
                <div
                  key={`${n.at}${n.title}${i}`}
                  style={{ borderBottom: "1px solid #141414", color: past ? "#555" : block ? TXT : undefined, background: block && !past ? "#1F0E0E" : undefined, fontWeight: block && !past ? 600 : 400 }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "44px 44px 36px 1fr 36px", gap: 8, padding: "5px 10px", alignItems: "center" }}>
                    <span>{t ? ctClock(t) : "—"}</span>
                    <span style={{ color: DIM }}>{t ? berClock(t) : "—"}</span>
                    <span style={{ color: past ? "#555" : TXT }}>{n.currency}</span>
                    <span>{n.title}</span>
                    <span style={{ color: block ? LOSS : DIM }}>{block ? "★★★" : "★★"}</span>
                  </div>
                  {block && t !== null && (
                    <div style={{ padding: "0 10px 6px 106px", fontSize: 11, lineHeight: 1.6 }}>
                      <span style={{ background: past ? "#555" : LOSS, color: "#000", fontWeight: 700, padding: "0 6px" }}>NE PAS TRADER : {whoText(n.currency)}</span>
                      <br />
                      <span style={{ color: past ? "#555" : LOSS }}>
                        {ctClock(t - BLACKOUT_MS)}–{ctClock(t + BLACKOUT_MS)} CT · {berClock(t - BLACKOUT_MS)}–{berClock(t + BLACKOUT_MS)} BER
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </Panel>
          <Panel title="CHECKLIST AVANT LES ORDRES" right={`${doneCount} / ${CHECKLIST.length}`}>
            {CHECKLIST.map((c) => {
              const done = !!checks[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={done}
                  className="term-row"
                  onClick={() => setChecks(JSON.stringify({ ...checks, [c.id]: !done }))}
                  style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "7px 10px", border: 0, borderBottom: "1px solid #141414", background: "transparent", fontFamily: "inherit", fontSize: "inherit", color: "inherit" }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      ...(done ? { background: GAIN, color: "#000" } : { border: "1px solid #666" }),
                    }}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ color: done ? "#777" : TXT, textDecoration: done ? "line-through" : "none" }}>{c.label}</span>
                    <span style={{ display: "block", color: DIM, fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>{c.hint}</span>
                  </span>
                </button>
              );
            })}
          </Panel>

          <Panel title="NOTIFICATIONS" right={sub ? "CET APPAREIL : ACTIVÉ" : "CET APPAREIL : COUPÉ"}>
            <div style={{ padding: "8px 10px 4px", color: DIM, fontSize: 10.5, fontWeight: 700 }}>TYPES</div>
            {PREF_ROWS.map(([k, label, hint]) => (
              <button
                key={k}
                type="button"
                aria-pressed={prefs[k]}
                disabled={pending}
                className="term-row"
                onClick={() => act(() => setPushPrefs({ ...prefs, [k]: !prefs[k] }))}
                style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "6px 10px", border: 0, background: "transparent", fontFamily: "inherit", fontSize: "inherit", color: "inherit" }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    ...(prefs[k] ? { background: GAIN, color: "#000" } : { border: "1px solid #666" }),
                  }}
                >
                  {prefs[k] ? "✓" : ""}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ color: TXT, fontWeight: 600 }}>{label}</span>
                  <span style={{ display: "block", color: DIM, fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>{hint}</span>
                </span>
              </button>
            ))}

            <div style={{ padding: "8px 10px 4px", color: DIM, fontSize: 10.5, fontWeight: 700, borderTop: "1px solid #1A1A1A", marginTop: 4 }}>CET APPAREIL</div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "2px 10px 10px", fontSize: 11.5 }}>
              {deviceControls}
            </div>

            <div style={{ padding: "6px 10px 2px", color: ORANGE, fontSize: 10.5, fontWeight: 700, borderTop: "1px solid #1A1A1A" }}>PROCHAINES NOTIFICATIONS</div>
            {upcoming.length === 0 && (
              <div style={{ color: DIM, padding: "8px 10px", fontSize: 11.5, lineHeight: 1.5 }}>Rien de prévu pour l&apos;instant. Marque un ordre « rempli » pour lancer le compte à rebours de sortie.</div>
            )}
            {upcoming.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 8, padding: "5px 10px", borderBottom: "1px solid #141414", fontSize: 12 }}>
                <span style={{ color: TXT, fontWeight: 700 }}>{berClock(r.at)}</span>
                <span style={{ color: r.color }}>{r.text}</span>
              </div>
            ))}
            <div style={{ color: DIM, fontSize: 10, padding: "4px 10px 8px" }}>Heures de Berlin.</div>
          </Panel>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "4px 12px", borderTop: "1px solid #2E2E2E", color: DIM, fontSize: 11 }}>
        <span>
          <span style={{ color: "#555" }}>○</span> FLUX DATABENTO : PAS ENCORE CONNECTÉ
        </span>
        <span>
          <span style={{ color: newsOk ? GAIN : LOSS }}>●</span> CALENDRIER DES NEWS
        </span>
        <span>
          <span style={{ color: sub ? GAIN : "#555" }}>{sub ? "●" : "○"}</span> NOTIFICATIONS SUR CET APPAREIL
        </span>
        <span style={{ marginLeft: "auto" }}>LES PRIX LIVE, DISTANCES ET ALERTES S&apos;AJOUTERONT AVEC DATABENTO</span>
      </div>
    </div>
      {/* ================= Mobile ================= */}
      <div className="tp-mob" style={{ flexDirection: "column", fontSize: 13, color: "#E6E6E6", margin: "-20px -16px 0" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#000" }}>
          <div style={{ display: "flex", alignItems: "center", background: ORANGE, color: "#000", fontWeight: 700, fontSize: 12 }}>
            <span style={{ padding: "8px 10px", background: "#000", color: ORANGE }}>FLUX</span>
            <span style={{ padding: "8px 10px" }}>PLAN · {dateLabel.slice(0, 9)}</span>
            <span style={{ marginLeft: "auto", padding: "8px 10px", background: "#000", color: ORANGE }}>
              CT {ctClock(now)} · BER {berClock(now)}
            </span>
          </div>
          <nav aria-label="Aller à" style={{ display: "flex", background: "#0A0A0A", borderBottom: "1px solid #2E2E2E" }}>
            {(
              [
                ["tp-plan", "PLAN", 0],
                ["tp-ordres", "ORDRES", posed.length + live.length],
                ["tp-jour", "JOUR", 0],
                ["tp-notifs", "NOTIFS", 0],
              ] as [string, string, number][]
            ).map(([id, label, n]) => (
              <a key={id} href={`#${id}`} style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 4, padding: "9px 0", fontSize: 11, fontWeight: 700, color: "#CCC", textDecoration: "none" }}>
                {label}
                {n > 0 && <span style={{ fontSize: 10, background: ORANGE, color: "#000", padding: "0 5px", borderRadius: 8 }}>{n}</span>}
              </a>
            ))}
          </nav>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", borderBottom: "1px solid #2E2E2E" }}>
          {kpis.map((k) => (
            <div
              key={k.label}
              onClick={
                k.edit
                  ? () => {
                      const v = window.prompt("Drawdown restant sur le compte, en $ (lu sur LMI) :", ddRaw ?? "");
                      if (v !== null && v.trim() !== "" && Number.isFinite(Number(v.replace(/\s/g, "").replace(",", ".")))) setDd(String(Number(v.replace(/\s/g, "").replace(",", "."))));
                    }
                  : undefined
              }
              style={{ padding: "8px 12px", borderRight: "1px solid #1A1A1A", borderBottom: "1px solid #1A1A1A" }}
            >
              <div style={{ color: ORANGE, fontSize: 10, fontWeight: 700 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color, lineHeight: 1.3 }}>{k.value}</div>
              <div style={{ color: DIM, fontSize: 9.5 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {alerts.map((a) => (
          <div key={a.text} style={{ padding: "7px 10px", fontWeight: 700, fontSize: 12, borderBottom: "1px solid #2E2E2E", background: a.red ? "#3A0D0D" : "#1F1608", color: a.red ? "#FF6B6B" : ORANGE }}>
            {a.text}
          </div>
        ))}

        {/* ---- PLAN ---- */}
        <div id="tp-plan" style={{ scrollMarginTop: 72, marginBottom: 14 }}>
          <section style={{ borderTop: "1px solid #4A3410", borderBottom: "1px solid #4A3410" }}>
            <button
              type="button"
              onClick={() => setSummaryOpen((v) => !v)}
              aria-expanded={summaryOpen}
              style={{ cursor: "pointer", width: "100%", textAlign: "left", border: 0, padding: "8px 12px", background: "#1F1608", color: ORANGE, fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}
            >
              {summaryOpen ? "▾" : "▸"} ◆ RÉSUMÉ DU JOUR
            </button>
            <div style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.6, color: "#F0F0F0" }}>
              {summary}
              {summaryOpen && (
                <div style={{ marginTop: 6 }}>
                  <span style={{ color: ORANGE }}>À faire toi-même :</span> sans flux de prix, l&apos;appli ne voit pas quels niveaux ont été touchés cette nuit ni l&apos;approche depuis 17h. Vérifie-les sur ton graphique avant de poser tes ordres (checklist dans JOUR).
                </div>
              )}
            </div>
          </section>

          <MobileHead title="PAIRES" right="TOUCHE UN PRIX = ORDRE" />
          {pairs.map((p) => {
            const st = statusOf(p.symbol);
            const on = open === p.symbol;
            const w = windows[p.symbol] ?? [];
            const stStyle: React.CSSProperties =
              st.kind === "pause" ? { border: `1px solid ${ORANGE}`, color: ORANGE } : st.kind === "done" ? { border: "1px solid #444", color: "#777" } : { background: st.kind === "soon" ? ORANGE : GAIN, color: "#000" };
            return (
              <section key={p.symbol} style={{ borderBottom: "1px solid #1A1A1A", background: on ? "#1F1608" : "transparent", boxShadow: on ? `inset 3px 0 0 ${ORANGE}` : "none", opacity: st.kind === "done" ? 0.6 : 1 }}>
                <button
                  type="button"
                  onClick={() => setOpen(on ? null : p.symbol)}
                  aria-expanded={on}
                  style={{ cursor: "pointer", width: "100%", textAlign: "left", border: 0, background: "transparent", color: "inherit", fontFamily: "inherit", padding: "11px 12px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: TXT, fontWeight: 700, fontSize: 15 }}>
                      {on ? "▾" : "▸"} {p.symbol}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", ...stStyle }}>{st.text}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
                      SL {p.sl} TK · {p.tp1}→{p.tp2 ?? "trail"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#A8A8A8", marginTop: 4 }}>{w.length ? `${w.map(([a, b]) => `${ctClock(a)}–${ctClock(b)}`).join(" · ")} CT` : "aucune fenêtre"}</div>
                </button>
                {on && (
                  <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.levels.map((L) => {
                      const o = orderPrices(p, L);
                      const card = (side: "Long" | "Short") => {
                        const q = side === "Long" ? o.buy : o.sell;
                        const has = hasOrder(p.symbol, L, side);
                        const c = side === "Long" ? BUY : SELL;
                        return (
                          <button
                            type="button"
                            disabled={pending || has}
                            onClick={() => act(() => addPlanOrder(day, p.symbol, L, side))}
                            aria-label={`${side === "Long" ? "Achat" : "Vente"} ${p.symbol} à ${px(q.entry, p.symbol)}`}
                            className="plan-zone"
                            data-side={side}
                            style={{
                              cursor: has ? "default" : "pointer",
                              flex: 1,
                              minWidth: 0,
                              textAlign: "left",
                              padding: "9px 10px",
                              background: has ? `${c}1A` : "#0D0D0D",
                              color: "#E6E6E6",
                              fontFamily: "inherit",
                              fontSize: 11,
                              lineHeight: 1.5,
                              border: `1px solid ${has ? c : side === "Long" ? "#1E4A5C" : "#4E2457"}`,
                            }}
                          >
                            <span style={{ display: "block", color: c, fontWeight: 700, fontSize: 12 }}>
                              {side === "Long" ? "ACHAT" : "VENTE"} {px(q.entry, p.symbol)}
                            </span>
                            <span style={{ display: "block", color: LOSS }}>SL {px(q.sl, p.symbol)}</span>
                            <span style={{ display: "block", color: GAIN }}>
                              TP {px(q.tp1, p.symbol)}
                              {q.tp2 ? ` → ${px(q.tp2, p.symbol)}` : ""}
                            </span>
                          </button>
                        );
                      };
                      return (
                        <div key={L}>
                          <div style={{ fontSize: 11, color: TXT, fontWeight: 700, marginBottom: 4 }}>NIVEAU {px(L, p.symbol)}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {card("Long")}
                            {card("Short")}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.5 }}>
                      Achat si le prix descend sur le niveau, vente s&apos;il monte dessus · entrée {p.offset >= 0 ? `${p.offset} tick avant le` : `${-p.offset} ticks au-delà du`} niveau.
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* ---- ORDRES ---- */}
        <div id="tp-ordres" style={{ scrollMarginTop: 72, marginBottom: 14 }}>
          <MobileHead title="ORDRES DU JOUR" right={`${posed.length} POSÉ${posed.length > 1 ? "S" : ""} · ${live.length} EN COURS · ${money(dayPnl)}`} />
          {orders.length === 0 && (
            <div style={{ color: DIM, padding: "18px 12px", lineHeight: 1.6 }}>
              Aucun ordre. Dans PLAN, ouvre une paire et touche un prix <span style={{ color: BUY }}>d&apos;achat</span> ou <span style={{ color: SELL }}>de vente</span>.
            </div>
          )}
          {orders.map((o) => {
            const p = pairOf(o.symbol);
            const st = closing === o.id && o.status === "filled" ? "closing" : o.status;
            const v = orderView(o, st);
            return (
              <article key={o.id} style={{ padding: 12, borderBottom: "1px solid #1A1A1A", opacity: st === "closed" || st === "cancelled" ? 0.7 : 1, boxShadow: st === "closed" || st === "cancelled" ? "none" : `inset 3px 0 0 ${st === "pending" ? BUY : GAIN}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: TXT, fontWeight: 700, fontSize: 15 }}>{o.symbol}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", background: o.side === "Long" ? BUY : SELL, color: "#000" }}>{sideText(o.side)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", ...v.badge[1] }}>{v.badge[0]}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: TXT }}>{px(o.entry, o.symbol)}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, marginTop: 5 }}>
                  <span style={{ color: DIM }}>NIV {px(o.level, o.symbol)}</span>
                  <span style={{ color: LOSS }}>SL {px(o.sl, o.symbol)}</span>
                  <span style={{ color: GAIN }}>
                    TP {px(o.tp1, o.symbol)}
                    {o.tp2 !== null ? ` → ${px(o.tp2, o.symbol)}` : ""}
                  </span>
                </div>
                {v.info && <div style={{ fontSize: 11.5, marginTop: 6, color: v.infoColor }}>{v.info}</div>}

                {st === "pending" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <input type="time" aria-label="Heure de remplissage (Berlin)" value={draft(o.id).time ?? ""} onChange={(e) => setDraft(o.id, { time: e.target.value })} style={{ ...input, flex: 1, fontSize: 14, padding: 8 }} />
                      <button type="button" disabled={pending} onClick={() => fillOrder(o)} style={{ ...btn(ORANGE, true), fontSize: 13, padding: "10px 16px" }}>
                        REMPLI
                      </button>
                      <button type="button" disabled={pending} aria-label="Annuler l'ordre" onClick={() => act(() => removePlanOrder(o.id))} style={{ ...btn("#999"), fontSize: 13, padding: "9px 12px" }}>
                        ✕
                      </button>
                    </div>
                    <div style={{ color: DIM, fontSize: 10, marginTop: 4 }}>Heure de Berlin · vide = maintenant</div>
                  </>
                )}

                {st === "filled" && v.exit && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "#A8A8A8" }}>
                        SORTIE MAX <span style={{ color: ORANGE, fontWeight: 700, fontSize: 16 }}>{berClock(v.exit.at)}</span> BER
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: v.exit.color }}>{v.exit.left}</span>
                    </div>
                    <div style={{ height: 6, background: "#1A1A1A", marginTop: 6 }}>
                      <div style={{ height: "100%", width: `${v.exit.pct.toFixed(0)}%`, background: v.exit.barColor }} />
                    </div>
                    <div style={{ color: DIM, fontSize: 10, marginTop: 4 }}>
                      {ctClock(v.exit.at)} CT · {v.exit.note}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button type="button" disabled={pending} onClick={() => act(() => unfillPlanOrder(o.id))} style={{ ...btn("#777"), fontSize: 12, padding: 10 }}>
                        PAS REMPLI
                      </button>
                      <button type="button" onClick={() => setClosing(o.id)} style={{ ...btn(ORANGE), flex: 1, fontSize: 13, padding: 10 }}>
                        JE SUIS SORTI…
                      </button>
                    </div>
                  </div>
                )}

                {st === "closing" && p && (
                  <div style={{ marginTop: 10, padding: 10, background: "#0D0D0D" }}>
                    <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, marginBottom: 8 }}>COMMENT S&apos;EST TERMINÉ LE TRADE ?</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {outcomeButtons(p).map(([k, label, c]) => (
                        <button
                          key={k}
                          type="button"
                          disabled={pending}
                          onClick={() => act(() => closePlanOrder(o.id, k, 0).then(() => setClosing(null)))}
                          style={{ ...btn(c), display: "flex", justifyContent: "space-between", padding: "10px 12px", fontSize: 13 }}
                        >
                          <span>{label}</span>
                          <span>{money(pnlOf(p, k))}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: "#A8A8A8" }}>
                      <span style={{ flex: 1 }}>TP1 + TRAIL, RUNNER +</span>
                      <input type="number" aria-label="Ticks du runner" value={draft(o.id).trail ?? ""} onChange={(e) => setDraft(o.id, { trail: e.target.value })} style={{ ...input, width: 60, fontSize: 14, padding: 7 }} />
                      <button type="button" disabled={pending} onClick={() => act(() => closePlanOrder(o.id, "TRAIL", Number(draft(o.id).trail) || 0).then(() => setClosing(null)))} style={{ ...btn(GAIN), fontSize: 12, padding: "8px 12px" }}>
                        OK
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: "#A8A8A8" }}>
                      <span style={{ flex: 1 }}>DURÉE MAX / AUTRE ($)</span>
                      <input type="number" aria-label="P&L en dollars" value={draft(o.id).other ?? ""} onChange={(e) => setDraft(o.id, { other: e.target.value })} style={{ ...input, width: 60, fontSize: 14, padding: 7 }} />
                      <button type="button" disabled={pending} onClick={() => act(() => closePlanOrder(o.id, "TIME", Number(draft(o.id).other) || 0).then(() => setClosing(null)))} style={{ ...btn("#E6E6E6"), fontSize: 12, padding: "8px 12px" }}>
                        OK
                      </button>
                    </div>
                    <button type="button" onClick={() => setClosing(null)} style={{ ...btn("#999"), width: "100%", marginTop: 8, padding: 7 }}>
                      RETOUR
                    </button>
                  </div>
                )}

                {st === "closed" && (
                  <>
                    <div style={{ fontSize: 11, color: "#A8A8A8", marginTop: 6, lineHeight: 1.5 }}>
                      {OUTCOME_TEXT[(o.outcome ?? "TIME") as Outcome]}
                      {o.filledAt ? ` · rempli ${berClock(new Date(o.filledAt).getTime())} BER` : ""}
                    </div>
                    {o.tradeId && (
                      <Link href={`/trades/${o.tradeId}`} style={{ display: "block", marginTop: 6, fontSize: 11.5, color: BUY, textDecoration: "none" }}>
                        ✓ Ajouté à tes Trades →
                      </Link>
                    )}
                  </>
                )}

                {st === "cancelled" && (
                  <>
                    <div style={{ fontSize: 11, color: ORANGE, marginTop: 6, lineHeight: 1.5 }}>{o.cancelReason}</div>
                    <button type="button" disabled={pending} onClick={() => act(() => removePlanOrder(o.id))} style={{ ...btn("#999"), marginTop: 6, padding: "6px 10px" }}>
                      RETIRER
                    </button>
                  </>
                )}
              </article>
            );
          })}
        </div>

        {/* ---- JOUR ---- */}
        <div id="tp-jour" style={{ scrollMarginTop: 72, marginBottom: 14 }}>
          <MobileHead title="NEWS DU JOUR" right={<StarFilter onlyThree={onlyThree} set={(v) => setStars(v ? "3" : "23")} />} />
          {!newsOk && <div style={{ padding: "10px 12px", color: DIM }}>Le flux des news n&apos;a pas répondu — il sera relu dans l&apos;heure.</div>}
          {newsOk && relevant.length === 0 && <div style={{ padding: "10px 12px", color: DIM }}>{onlyThree ? "Aucune news 3★ pour tes paires ce jour-là." : "Aucune news 3★, ni 2★ à venir, pour tes paires ce jour-là."}</div>}
          {relevant.map((n, i) => {
            const t = n.at ? new Date(n.at).getTime() : null;
            const block = n.impact === "high" && t !== null;
            const past = t !== null && t < now;
            return (
              <div key={`m${n.at}${n.title}${i}`} style={{ padding: "8px 12px", borderBottom: "1px solid #141414", color: past ? "#555" : block ? TXT : undefined, background: block && !past ? "#1F0E0E" : undefined, fontWeight: block && !past ? 600 : 400 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700 }}>{t ? berClock(t) : "—"}</span>
                  <span style={{ color: DIM, fontSize: 11 }}>{t ? `${ctClock(t)} CT` : ""}</span>
                  <span style={{ color: past ? "#555" : TXT }}>{n.currency}</span>
                  <span style={{ marginLeft: "auto", color: block ? LOSS : DIM }}>{block ? "★★★" : "★★"}</span>
                </div>
                <div style={{ marginTop: 2 }}>{n.title}</div>
                {block && t !== null && (
                  <div style={{ fontSize: 10.5, marginTop: 4 }}>
                    <span style={{ background: past ? "#555" : LOSS, color: "#000", fontWeight: 700, padding: "0 5px" }}>NE PAS TRADER : {whoText(n.currency)}</span>{" "}
                    <span style={{ color: past ? "#555" : LOSS }}>
                      {berClock(t - BLACKOUT_MS)}–{berClock(t + BLACKOUT_MS)} BER
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          <MobileHead title="HORAIRES" right="1 LIGNE = 1 HEURE · ORANGE = MAINTENANT" />
          <div style={{ padding: "8px 12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: `62px repeat(${pairs.length}, minmax(0, 1fr))`, gap: 3, fontSize: 12, position: "sticky", top: 72, background: "#000", padding: "4px 0", zIndex: 2 }}>
              <span style={{ color: DIM, fontSize: 10, alignSelf: "end" }}>CT · BER</span>
              {pairs.map((p) => (
                <span key={p.symbol} style={{ textAlign: "center", color: TXT, fontWeight: 700 }}>
                  {p.symbol}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {hours.map((h) => {
                const cur = isToday && nowCt.h === h;
                const past = isToday && h < nowCt.h;
                return (
                  <div key={h} style={{ display: "grid", gridTemplateColumns: `62px repeat(${pairs.length}, minmax(0, 1fr))`, gap: 3 }}>
                    <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, paddingLeft: 4, ...(cur ? { background: ORANGE, color: "#000" } : { color: ORANGE }) }}>
                      <span style={{ fontWeight: 700 }}>{hh(h)}</span> <span style={{ color: cur ? "#000" : DIM }}>{berClock(hourAt(h)).slice(0, 2)}h</span>
                    </span>
                    {pairs.map((p) => {
                      const blocked = h < p.hours[0] || h >= p.hours[1] || p.exclude.includes(h);
                      const hit = blocksFor(p.symbol, blocking).filter((b) => b.at + BLACKOUT_MS > hourAt(h) && b.at - BLACKOUT_MS < hourAt(h + 1));
                      return (
                        <span
                          key={p.symbol}
                          style={{
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            color: LOSS,
                            background: blocked ? "#161616" : "#123A22",
                            borderTop: blocked ? "none" : `1px solid ${GAIN}`,
                            outline: cur ? `1px solid ${ORANGE}` : "none",
                            outlineOffset: -1,
                            opacity: past ? 0.45 : 1,
                          }}
                        >
                          {!blocked && hit.length ? "N" : ""}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: 10, color: "#A8A8A8" }}>
              <span>
                <span style={{ display: "inline-block", width: 10, height: 8, background: "#123A22", borderTop: `1px solid ${GAIN}` }} /> PERMIS
              </span>
              <span>
                <span style={{ display: "inline-block", width: 10, height: 8, background: "#161616" }} /> PAS D&apos;ORDRE
              </span>
              <span>
                <span style={{ color: LOSS, fontWeight: 700 }}>N</span> NEWS 3★
              </span>
            </div>
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              style={{ cursor: "pointer", border: 0, background: "transparent", fontFamily: "inherit", padding: "10px 0 4px", fontSize: 11, fontWeight: 700, color: ORANGE }}
            >
              {whyOpen ? "▾" : "▸"} POURQUOI CES HORAIRES
            </button>
            {whyOpen && (
              <div style={{ fontSize: 11, lineHeight: 1.6, color: "#A8A8A8" }}>
                <div style={{ color: DIM, marginBottom: 2 }}>Un trade rempli avant une heure grise se gère jusqu&apos;au bout (SL, TP1, trailing, 4 h max).</div>
                {pairs
                  .filter((p) => p.why)
                  .map((p) => (
                    <div key={p.symbol}>
                      <span style={{ color: TXT, fontWeight: 700 }}>{p.symbol}</span> · {p.why}
                    </div>
                  ))}
              </div>
            )}
          </div>

          <MobileHead title="CHECKLIST" right={`${doneCount} / ${CHECKLIST.length}`} />
          {CHECKLIST.map((c) => {
            const done = !!checks[c.id];
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={done}
                onClick={() => setChecks(JSON.stringify({ ...checks, [c.id]: !done }))}
                style={{ cursor: "pointer", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #141414", background: "transparent", color: "inherit", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px" }}
              >
                <Box on={done} />
                <span style={{ flex: 1 }}>
                  <span style={{ color: done ? "#777" : TXT, textDecoration: done ? "line-through" : "none" }}>{c.label}</span>
                  <span style={{ display: "block", color: DIM, fontSize: 10.5, marginTop: 2, lineHeight: 1.45 }}>{c.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- NOTIFS ---- */}
        <div id="tp-notifs" style={{ scrollMarginTop: 72, marginBottom: 14 }}>
          <MobileHead title="NOTIFICATIONS" right={sub ? "CET APPAREIL : ACTIVÉ" : "CET APPAREIL : COUPÉ"} />
          <div style={{ padding: "10px 12px 4px", color: DIM, fontSize: 10.5, fontWeight: 700 }}>PROCHAINES · HEURES DE BERLIN</div>
          {upcoming.length === 0 && <div style={{ color: DIM, padding: "8px 12px", fontSize: 11.5, lineHeight: 1.5 }}>Rien de prévu pour l&apos;instant. Marque un ordre « rempli » pour lancer le compte à rebours de sortie.</div>}
          {upcoming.map((r, i) => (
            <div key={`m${i}`} style={{ display: "grid", gridTemplateColumns: "46px 1fr", gap: 8, padding: "8px 12px", borderBottom: "1px solid #141414" }}>
              <span style={{ color: TXT, fontWeight: 700 }}>{berClock(r.at)}</span>
              <span style={{ color: r.color }}>{r.text}</span>
            </div>
          ))}
          <div style={{ padding: "14px 12px 4px", color: DIM, fontSize: 10.5, fontWeight: 700 }}>TYPES</div>
          {PREF_ROWS.map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              aria-pressed={prefs[k]}
              disabled={pending}
              onClick={() => act(() => setPushPrefs({ ...prefs, [k]: !prefs[k] }))}
              style={{ cursor: "pointer", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #141414", background: "transparent", color: "inherit", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px" }}
            >
              <Box on={prefs[k]} />
              <span style={{ flex: 1 }}>
                <span style={{ color: TXT, fontWeight: 600 }}>{label}</span>
                <span style={{ display: "block", color: DIM, fontSize: 10.5, marginTop: 2, lineHeight: 1.45 }}>{hint}</span>
              </span>
            </button>
          ))}
          <div style={{ padding: "14px 12px 6px", color: DIM, fontSize: 10.5, fontWeight: 700 }}>CET APPAREIL</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "0 12px 12px", fontSize: 12 }}>{deviceControls}</div>
        </div>
      </div>
    </>
  );
}

/** The news list's filter: the three-star releases only, or the two-star ones too. */
function StarFilter({ onlyThree, set }: { onlyThree: boolean; set: (onlyThree: boolean) => void }) {
  const chip = (on: boolean): React.CSSProperties => ({
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 7px",
    border: `1px solid ${on ? ORANGE : "#444"}`,
    background: on ? ORANGE : "transparent",
    color: on ? "#000" : "#AAA",
  });
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button type="button" aria-pressed={onlyThree} onClick={() => set(true)} style={chip(onlyThree)} title="Seulement les news 3 étoiles">
        ★★★
      </button>
      <button type="button" aria-pressed={!onlyThree} onClick={() => set(false)} style={chip(!onlyThree)} title="Les news 2 et 3 étoiles">
        ★★ + ★★★
      </button>
    </span>
  );
}

function MobileHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 12px", background: "#1A1A1A", color: ORANGE, fontWeight: 700, fontSize: 11, letterSpacing: "0.04em", marginTop: 8 }}>
      <span>{title}</span>
      {right && <span style={{ color: DIM, fontWeight: 500, fontSize: 10 }}>{right}</span>}
    </div>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        ...(on ? { background: GAIN, color: "#000" } : { border: "1px solid #666" }),
      }}
    >
      {on ? "✓" : ""}
    </span>
  );
}
