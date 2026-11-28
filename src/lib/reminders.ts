import { prisma } from "@/lib/prisma";
import { getEconomicEvents, type EconomicEvent } from "@/lib/economicCalendar";
import { newsCurrencies } from "@/lib/contracts";
import { pushOnce } from "@/lib/push";
import { exitAt } from "@/lib/exitTime";
import { loadPairPlans, pushPrefs } from "@/lib/planData";
import { afterMs, orderWindows, windowEndReason, dayKey, type Blocking } from "@/lib/tradingPlan";
import { sessionDate } from "@/lib/databento/clock";
import { fmtPrice } from "@/lib/databento/format";
import { COTATION_PERIMEE_MIN, ageMin, cotations, ligneLaPlusProche, releverCotations } from "@/lib/quotes";

/** How long before a blocking release the phone is told: time to pull the orders. */
export const NEWS_LEAD_MIN = 15;
/** The warning before a trade's time is up. */
export const EXIT_WARN_MIN = 15;
/** The warning before a posed order must come off. */
export const PULL_LEAD_MIN = 1;
/** Les prix sont relevés à ce rythme : la source est différée d'environ dix minutes, plus souvent n'apprendrait rien. */
const COTATIONS_TOUTES_LES_MIN = 5;

const clock = (t: number, timeZone: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });
const both = (t: number) => `${clock(t, "Europe/Berlin")} Berlin · ${clock(t, "America/Chicago")} CT`;
const URL = "/trading-plan";

// The calendar, read again every half hour rather than every minute.
let calendar: { at: number; events: EconomicEvent[] } = { at: 0, events: [] };
async function events() {
  if (Date.now() - calendar.at > 30 * 60000) {
    const r = await getEconomicEvents();
    if (r.ok) calendar = { at: Date.now(), events: r.events };
  }
  return calendar.events;
}

/** The releases that block orders: the source's three stars, as the backtest's blackout counts them. */
export const blockingOf = (list: EconomicEvent[]): Blocking[] =>
  list.filter((e) => e.kind === "release" && e.impact === "high" && e.at).map((e) => ({ at: new Date(e.at!).getTime(), currency: e.currency, title: e.title }));

/**
 * One pass of the reminders, run every minute by the server, each kind only
 * if it is switched on in the plan's page.
 *
 * News: fifteen minutes before each blocking release, during the order hours,
 * in a currency one of the pairs follows. Exit: fifteen minutes before a
 * filled order's time is up (four hours, never past 16h Chicago), and when it
 * is. Pull: a minute before a posed order's window closes — a release, an
 * excluded hour, the end of the orders.
 */
export async function remindersTick(now = Date.now()) {
  const prefs = await pushPrefs();
  const plans = await loadPairPlans("owner");
  const pairs = plans.map((p) => p.symbol);
  const blocking = pairs.length && (prefs.news || prefs.pull) ? blockingOf(await events()) : [];

  if (prefs.news) {
    for (const e of blocking) {
      const lead = e.at - now;
      if (lead <= 0 || lead > NEWS_LEAD_MIN * 60000) continue;
      // Only while orders can be working: 2h to 14h Chicago, and the ten minutes either side.
      const [h, m] = clock(e.at, "America/Chicago").split(":").map(Number);
      if (h * 60 + m < 110 || h * 60 + m > 850) continue;
      const hit = pairs.filter((p) => newsCurrencies(p).includes(e.currency));
      if (!hit.length) continue;
      const who = hit.length === pairs.length ? "toutes tes paires" : hit.join(" · ");
      await pushOnce(`news|${e.at}|${e.currency}|${e.title}`, {
        title: `News à ${clock(e.at, "Europe/Berlin")} · ${e.currency} ${e.title}`,
        body: `Ne pas trader ${who} de ${clock(e.at - 600000, "Europe/Berlin")} à ${clock(e.at + afterMs(e), "Europe/Berlin")} (Berlin). Retire tes ordres.`,
        url: URL,
        tag: `news-${e.at}`,
      });
    }
  }

  if (prefs.pull) {
    const day = dayKey(sessionDate(now));
    const pending = await prisma.planOrder.findMany({ where: { day, status: "pending" } });
    for (const o of pending) {
      const p = plans.find((x) => x.symbol === o.symbol);
      if (!p) continue;
      const w = orderWindows(p, day, blocking).find(([a, b]) => now >= a && now < b);
      if (!w || w[1] - now > PULL_LEAD_MIN * 60000) continue;
      const why = windowEndReason(p, w[1], day, blocking);
      await pushOnce(`pull|${o.id}|${w[1]}`, {
        title: `Retire ton ordre ${o.symbol} — ${why}`,
        body: `${o.side === "Long" ? "Achat" : "Vente"} ${o.symbol} à ${fmtPrice(o.entry, o.symbol, p.tick)} : plus d'ordre à partir de ${both(w[1])}.`,
        url: URL,
        tag: `pull-${o.id}`,
      });
    }
  }

  /**
   * Le prix approche d'une ligne : c'est le moment de poser l'ordre.
   *
   * Le seuil est le stop de la paire — « à moins d'un stop de ta ligne » —
   * plutôt qu'un nombre fixe : vingt ticks ne veulent pas dire la même chose
   * sur ZN et sur 6E. Une alerte par ligne et par séance, et rien pour une
   * ligne qui a déjà un ordre ou pour une paire qui a déjà tradé.
   *
   * La cotation est gratuite et différée d'une dizaine de minutes, ce que le
   * message dit. Périmée au-delà d'une demi-heure, elle ne déclenche rien :
   * un flux cassé ne doit pas ressembler à un marché immobile.
   */
  if (prefs.approche && pairs.length) {
    const h = Number(clock(now, "America/Chicago").slice(0, 2));
    // Relevé pendant les heures où un ordre peut être posé, et un peu autour.
    if (h >= 1 && h <= 15 && new Date(now).getUTCMinutes() % COTATIONS_TOUTES_LES_MIN === 0) await releverCotations(pairs);

    const day = dayKey(sessionDate(now));
    const [q, duJour] = await Promise.all([cotations(), prisma.planOrder.findMany({ where: { day } })]);
    for (const c of q) {
      const p = plans.find((x) => x.symbol === c.symbol);
      if (!p) continue;
      const age = ageMin(c, now);
      if (age > COTATION_PERIMEE_MIN) continue;
      // Hors de la fenêtre d'ordres de la paire, l'approche n'intéresse personne.
      if (!orderWindows(p, day, blocking).some(([a, b]) => now >= a && now < b)) continue;
      // Une paire qui a déjà un trade du jour est finie : un trade par jour et par paire.
      if (duJour.some((o) => o.symbol === c.symbol && (o.status === "filled" || o.status === "closed"))) continue;
      const proche = ligneLaPlusProche(c.price, p.levels, p.tick);
      if (!proche || Math.abs(proche.ticks) > p.sl) continue;
      if (duJour.some((o) => o.symbol === c.symbol && Math.abs(o.level - proche.niveau) < p.tick / 2)) continue;
      await pushOnce(`approche|${day}|${c.symbol}|${proche.niveau}`, {
        title: `${c.symbol} à ${Math.abs(proche.ticks)} ticks de ${fmtPrice(proche.niveau, c.symbol, p.tick)}`,
        body: `${fmtPrice(c.price, c.symbol, p.tick)} il y a ${age} min (prix différé). Pose ton ordre si la ligne tient.`,
        url: URL,
        tag: `approche-${c.symbol}-${proche.niveau}`,
      });
    }
  }

  /**
   * Les ordres annulés que le bot avait posés : il ne sait pas les retirer, et
   * ils dorment chez le courtier jusqu'à ce que le trader les retire.
   *
   * Relancé toutes les cinq minutes, quatre fois au plus : une notification
   * manquée laisserait un ordre interdit en place, mais une relance sans fin
   * finirait par être ignorée. Le bouton « RETIRÉ » d'Ordres du jour arrête
   * la série.
   */
  if (prefs.bot) {
    const aRetirer = await prisma.planOrder.findMany({ where: { status: "cancelled", botSentAt: { not: null }, botCancelAt: null } });
    for (const o of aRetirer) {
      const depuis = now - o.createdAt.getTime();
      const tour = Math.floor(depuis / (5 * 60000));
      if (tour < 1 || tour > 4) continue;
      const p = plans.find((x) => x.symbol === o.symbol);
      await pushOnce(`retrait|${o.id}|${tour}`, {
        title: `Toujours posé : retire ${o.symbol} dans VolFix`,
        body: `${o.side === "Long" ? "Achat" : "Vente"} ${o.symbol} à ${p ? fmtPrice(o.entry, o.symbol, p.tick) : o.entry}. ${o.cancelReason ?? ""} Confirme dans Ordres du jour quand c'est retiré.`,
        url: URL,
        tag: `retrait-${o.id}`,
      });
    }
  }

  // What was sent more than a week ago will not come round again.
  if (new Date(now).getUTCMinutes() === 0) await prisma.pushSent.deleteMany({ where: { sentAt: { lt: new Date(now - 7 * 86400000) } } });

  if (!prefs.exit) return;
  const open = await prisma.planOrder.findMany({ where: { status: "filled" } });
  for (const o of open) {
    if (!o.filledAt) continue;
    const end = exitAt(o.filledAt.getTime());
    if (now > end + 20 * 3600000) continue;
    if (now >= end) {
      await pushOnce(`exit|${o.id}`, {
        title: `${o.symbol} : temps écoulé — ferme le trade`,
        body: `Rempli à ${both(o.filledAt.getTime())}. TP1 pas touché : ferme au marché. Runner encore ouvert : ferme-le aussi.`,
        url: URL,
        tag: `exit-${o.id}`,
      });
    } else if (end - now <= EXIT_WARN_MIN * 60000) {
      await pushOnce(`warn|${o.id}`, {
        title: `${o.symbol} : sortie dans ${Math.ceil((end - now) / 60000)} min`,
        body: `Fin à ${both(end)}. Prépare-toi à fermer si TP1 n'est pas touché.`,
        url: URL,
        tag: `exit-${o.id}`,
      });
    }
  }
}
