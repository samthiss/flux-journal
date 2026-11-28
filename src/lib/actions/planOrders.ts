"use server";

import { prisma } from "@/lib/prisma";
import { exigeProprietaire, monJournal } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { loadPairPlans } from "@/lib/planData";
import { orderPrices, pnlOf, type Outcome } from "@/lib/tradingPlan";
import { YEARLY_LEVELS } from "@/lib/strategies";
import { fmtPrice } from "@/lib/databento/format";
import { pushAll } from "@/lib/push";
import { pushPrefs } from "@/lib/planData";

const done = () => revalidatePath("/trading-plan");

/**
 * Prévenir que des ordres dorment chez le courtier.
 *
 * Le journal sait annuler, le bot d'exécution ne sait pas : son fichier de
 * signal ne porte qu'un ordre d'entrée. Un ordre annulé ici reste donc posé
 * dans VolFix, et s'il est rempli plus tard c'est un second trade sur la
 * paire — ce que le plan interdit, et que le backtest n'a jamais compté. D'où
 * la notification immédiate, puis les relances de `remindersTick` jusqu'à ce
 * que le retrait soit confirmé.
 */
async function aRetirerAlaMain(orders: { symbol: string; side: string; entry: number }[], raison: string) {
  if (!orders.length) return;
  if (!(await pushPrefs()).bot) return;
  const quoi = orders.map((o) => `${o.symbol} ${o.side === "Long" ? "achat" : "vente"} à ${o.entry}`).join(" · ");
  await pushAll({
    title: orders.length > 1 ? `Retire ${orders.length} ordres dans VolFix` : `Retire ton ordre ${orders[0].symbol} dans VolFix`,
    body: `${quoi}. ${raison} Le bot ne sait pas annuler : confirme dans Ordres du jour quand c'est fait.`,
    url: "/trading-plan",
    tag: "bot-retrait",
  });
}

/**
 * Le bot d'exécution ne reçoit rien d'ici : c'est lui qui interroge
 * `/api/bot/orders` depuis la machine du trader, puis accuse réception. Ces
 * actions ne font donc que tenir l'état que le bot lira — `botSentAt` vide
 * veut dire « à poser », un ordre annulé qu'il avait posé veut dire « à
 * retirer » — et c'est son accusé qui marque la ligne.
 */

/** An order on a level of the plan, priced from the pair's setting rather than from the page. */
export async function addPlanOrder(day: string, symbol: string, level: number, side: "Long" | "Short") {
  await exigeProprietaire();
  const p = (await loadPairPlans(await monJournal())).find((x) => x.symbol === symbol);
  if (!p || !p.levels.some((l) => Math.abs(l - level) < p.tick / 2)) throw new Error("Niveau inconnu.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Jour invalide.");
  const already = await prisma.planOrder.findFirst({ where: { day, symbol, level, side, status: { not: "cancelled" } } });
  if (already) return;
  const px = orderPrices(p, level)[side === "Long" ? "buy" : "sell"];
  await prisma.planOrder.create({ data: { day, symbol, side, level, entry: px.entry, sl: px.sl, tp1: px.tp1, tp2: px.tp2 } });
  done();
}

/**
 * Filled: the four hours start. The pair's other orders still posed are
 * cancelled — one trade a day and a pair.
 */
export async function fillPlanOrder(id: string, filledAt: string) {
  await exigeProprietaire();
  const t = new Date(filledAt);
  if (Number.isNaN(t.getTime())) throw new Error("Heure invalide.");
  const o = await prisma.planOrder.update({ where: { id }, data: { status: "filled", filledAt: t } });
  const hhmm = t.toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  const raison = `Annulé : ${o.symbol} rempli à ${hhmm} Berlin (un trade par jour et par paire).`;
  // Relevés avant la bascule : ceux que le bot avait posés sont à retirer à la main.
  const posesParLeBot = await prisma.planOrder.findMany({
    where: { day: o.day, symbol: o.symbol, status: "pending", id: { not: id }, botSentAt: { not: null } },
  });
  await prisma.planOrder.updateMany({
    where: { day: o.day, symbol: o.symbol, status: "pending", id: { not: id } },
    data: { status: "cancelled", cancelReason: raison },
  });
  await aRetirerAlaMain(posesParLeBot, `${o.symbol} a été rempli à ${hhmm} Berlin.`);
  done();
}

/**
 * Gone from the list: posed by mistake, or a cancelled one cleared away.
 *
 * Un ordre que le bot a posé n'est pas effacé : il passe en annulé, pour
 * ressortir dans sa liste « à retirer ». L'effacer le laisserait dormir chez
 * le courtier sans que personne ne le sache.
 */
export async function removePlanOrder(id: string) {
  await exigeProprietaire();
  const o = await prisma.planOrder.findUnique({ where: { id } });
  if (o?.botSentAt && !o.botCancelAt) {
    await prisma.planOrder.update({ where: { id }, data: { status: "cancelled", cancelReason: "Retiré depuis le journal : à retirer dans VolFix." } });
    await aRetirerAlaMain([o], "Tu l'as retiré du journal.");
    done();
    return;
  }
  await prisma.planOrder.delete({ where: { id } });
  done();
}

/** Retiré dans VolFix, à la main : les relances s'arrêtent. */
export async function markPlanOrderPulled(id: string) {
  await exigeProprietaire();
  await prisma.planOrder.update({ where: { id }, data: { botCancelAt: new Date(), botError: null } });
  done();
}

/**
 * À reprendre : l'ordre repart dans la liste du bot.
 *
 * Sert après un échec de son côté — marge refusée, plateforme déconnectée :
 * on efface ce qu'il a dit pour qu'il le reprenne à sa prochaine
 * interrogation, sans avoir à retoucher la base à la main.
 */
export async function resendPlanOrder(id: string) {
  await exigeProprietaire();
  const o = await prisma.planOrder.findUniqueOrThrow({ where: { id } });
  await prisma.planOrder.update({
    where: { id },
    data: o.status === "cancelled" ? { botCancelAt: null, botError: null } : { botSentAt: null, botError: null },
  });
  done();
}

/** Back to posed, if REMPLI was pressed by mistake. */
export async function unfillPlanOrder(id: string) {
  await exigeProprietaire();
  await prisma.planOrder.update({ where: { id }, data: { status: "pending", filledAt: null } });
  done();
}

/**
 * Closed: the trade goes into the journal, under the yearly levels, with its
 * prices and how it ended. `extra` is the runner's ticks on a trail, or the
 * dollars of an exit at market.
 */
export async function closePlanOrder(id: string, outcome: Outcome, extra: number) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  if (!["SL", "BE", "TP1", "TRAIL", "TP2", "TIME"].includes(outcome)) throw new Error("Résultat invalide.");
  const o = await prisma.planOrder.findUniqueOrThrow({ where: { id } });
  if (o.status !== "filled" || !o.filledAt) throw new Error("Ordre pas rempli.");
  const p = (await loadPairPlans(ownerId)).find((x) => x.symbol === o.symbol);
  if (!p) throw new Error("Paire inconnue.");
  const pnl = Math.round(pnlOf(p, outcome, Number(extra) || 0) * 100) / 100;
  const dir = o.side === "Long" ? 1 : -1;
  const now = new Date();
  // The journal keeps the trader's own date and hour: Berlin's, at the fill.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(o.filledAt);
  const time = o.filledAt.toLocaleTimeString("fr-FR", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  const trade = await prisma.trade.create({
    data: {
      ownerId,
      date: new Date(date),
      time,
      symbol: o.symbol,
      side: o.side,
      size: p.lots,
      pnl,
      risk: p.sl * p.tickValue * p.lots,
      rr: Number((pnl / (p.sl * p.tickValue * p.lots)).toFixed(2)),
      tpReached: outcome === "TP2" ? 2 : outcome === "SL" ? null : 1,
      setup: "Backtest reverse",
      strategy: YEARLY_LEVELS,
      level: o.level,
      slPrice: o.sl,
      tp1Price: o.tp1,
      tp2Price: o.tp2,
      trailPrice: outcome === "TRAIL" ? o.entry + dir * (Number(extra) || 0) * p.tick : null,
      outcome,
      postTradeNotes: `Depuis le Trading Plan : entrée ${fmtPrice(o.entry, o.symbol, p.tick)}, ${outcome}.`,
    },
  });
  await prisma.planOrder.update({ where: { id }, data: { status: "closed", closedAt: now, outcome, pnl, tradeId: trade.id } });
  revalidatePath("/");
  revalidatePath("/trades");
  done();
}

export async function setPushPrefs(prefs: { exit: boolean; news: boolean; pull: boolean; bot: boolean; approche: boolean; autoPose: boolean }) {
  await exigeProprietaire();
  const data = { exit: !!prefs.exit, news: !!prefs.news, pull: !!prefs.pull, bot: !!prefs.bot, approche: !!prefs.approche, autoPose: !!prefs.autoPose };
  await prisma.pushPrefs.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  done();
}
