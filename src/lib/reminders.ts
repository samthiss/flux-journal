import { prisma } from "@/lib/prisma";
import { getEconomicEvents, type EconomicEvent } from "@/lib/economicCalendar";
import { newsCurrencies } from "@/lib/contracts";
import { pushOnce } from "@/lib/push";
import { exitAt } from "@/lib/exitTime";

/** How long before a blocking release the phone is told: time to pull the orders. */
export const NEWS_LEAD_MIN = 15;
/** The warning before a trade's time is up. */
export const EXIT_WARN_MIN = 15;

const clock = (t: number, timeZone: string) => new Date(t).toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });
const both = (t: number) => `${clock(t, "Europe/Berlin")} Berlin · ${clock(t, "America/Chicago")} CT`;

// The calendar, read again every half hour rather than every minute.
let calendar: { at: number; events: EconomicEvent[] } = { at: 0, events: [] };
async function events() {
  if (Date.now() - calendar.at > 30 * 60000) {
    const r = await getEconomicEvents();
    if (r.ok) calendar = { at: Date.now(), events: r.events };
  }
  return calendar.events;
}

/**
 * One pass of the reminders, run every minute by the server.
 *
 * News: fifteen minutes before each three-star release during the order hours (the source's own
 * stars, as the backtest's blackout counts them) in a currency one of the
 * plan's pairs follows. A trade on: fifteen minutes before its time is up (four
 * hours, never past 16h Chicago), and when it is.
 */
export async function remindersTick(now = Date.now()) {
  const pairs = (await prisma.databentoSymbol.findMany({ where: { ownerId: "owner" }, select: { symbol: true } })).map((r) => r.symbol);
  if (pairs.length) {
    for (const e of await events()) {
      if (e.kind !== "release" || e.impact !== "high" || !e.at) continue;
      const t = new Date(e.at).getTime();
      const lead = t - now;
      // Inside the lead, and not yet out: sent once, on the first pass that sees it.
      if (lead <= 0 || lead > NEWS_LEAD_MIN * 60000) continue;
      // Only while orders can be working: 2h to 14h Chicago, and the ten minutes either side.
      const [h, m] = clock(t, "America/Chicago").split(":").map(Number);
      if (h * 60 + m < 110 || h * 60 + m > 850) continue;
      const hit = pairs.filter((p) => newsCurrencies(p).includes(e.currency));
      if (!hit.length) continue;
      const who = hit.length === pairs.length ? "toutes tes paires" : hit.join(" · ");
      await pushOnce(`news|${e.at}|${e.currency}|${e.title}`, {
        title: `News à ${clock(t, "Europe/Berlin")} · ${e.currency} ${e.title}`,
        body: `Ne pas trader ${who} de ${clock(t - 600000, "Europe/Berlin")} à ${clock(t + 600000, "Europe/Berlin")} (Berlin). Retire tes ordres.`,
        url: "/checklist",
        tag: `news-${e.at}`,
      });
    }
  }

  // What was sent more than a week ago will not come round again.
  if (new Date(now).getUTCMinutes() === 0) await prisma.pushSent.deleteMany({ where: { sentAt: { lt: new Date(now - 7 * 86400000) } } });

  const open = await prisma.openPosition.findMany({ where: { closedAt: null } });
  for (const p of open) {
    const end = exitAt(p.filledAt.getTime());
    // A position nobody closed: forgotten a day later.
    if (now > end + 20 * 3600000) {
      await prisma.openPosition.update({ where: { id: p.id }, data: { closedAt: new Date(end) } });
      continue;
    }
    if (now >= end) {
      await pushOnce(`exit|${p.id}`, {
        title: `${p.symbol} : temps écoulé — ferme le trade`,
        body: `Rempli à ${both(p.filledAt.getTime())}. TP1 pas touché : ferme au marché. Runner encore ouvert : ferme-le aussi.`,
        url: "/checklist",
        tag: `exit-${p.id}`,
      });
    } else if (end - now <= EXIT_WARN_MIN * 60000) {
      await pushOnce(`warn|${p.id}`, {
        title: `${p.symbol} : sortie dans ${Math.ceil((end - now) / 60000)} min`,
        body: `Fin à ${both(end)}. Prépare-toi à fermer si TP1 n'est pas touché.`,
        url: "/checklist",
        tag: `exit-${p.id}`,
      });
    }
  }
}
