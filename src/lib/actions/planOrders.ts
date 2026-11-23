"use server";

import { prisma } from "@/lib/prisma";
import { exigeProprietaire, monJournal } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { loadPairPlans } from "@/lib/planData";
import { orderPrices, pnlOf, type Outcome } from "@/lib/tradingPlan";
import { YEARLY_LEVELS } from "@/lib/strategies";
import { fmtPrice } from "@/lib/databento/format";

const done = () => revalidatePath("/trading-plan");

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
  await prisma.planOrder.updateMany({
    where: { day: o.day, symbol: o.symbol, status: "pending", id: { not: id } },
    data: { status: "cancelled", cancelReason: `Annulé : ${o.symbol} rempli à ${hhmm} Berlin (un trade par jour et par paire).` },
  });
  done();
}

/** Gone from the list: posed by mistake, or a cancelled one cleared away. */
export async function removePlanOrder(id: string) {
  await exigeProprietaire();
  await prisma.planOrder.delete({ where: { id } });
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

export async function setPushPrefs(prefs: { exit: boolean; news: boolean; pull: boolean }) {
  await exigeProprietaire();
  const data = { exit: !!prefs.exit, news: !!prefs.news, pull: !!prefs.pull };
  await prisma.pushPrefs.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  done();
}
