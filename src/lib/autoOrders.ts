/**
 * Poser l'ordre tout seul quand le prix approche d'une ligne.
 *
 * Le journal connaît les lignes, les horaires et le calendrier ; il lui
 * manquait seulement de savoir où est le prix. Avec une cotation, il peut
 * faire le geste à la place du trader : créer l'ordre, que le pont remonte au
 * bot dans les vingt secondes.
 *
 * Pourquoi une marge de vingt ticks, et pourquoi elle suffit : la cotation est
 * différée d'une dizaine de minutes, et sur un an l'écart du prix en dix
 * minutes est de 4 ticks en médiane sur 6E, 11 au 90e centile, 25 au 99e — 3
 * et 8 sur 6B, 1 et 3 sur ZN, 3 et 8 sur les grains. Vingt ticks couvrent donc
 * le retard dans 98 à 99 % des cas. Un seuil de dix ticks, lui, serait du
 * bruit : le prix serait aussi souvent déjà passé que pas encore arrivé.
 *
 * Les garde-fous, dans l'ordre où ils comptent :
 *
 *   - éteint par défaut ; c'est de l'argent réel sans personne devant l'écran ;
 *   - uniquement dans une fenêtre d'ordres de la paire, ce qui exclut déjà les
 *     news et les heures écartées : `orderWindows` les a retirées ;
 *   - et seulement s'il reste du temps dans cette fenêtre, parce que le bot ne
 *     sait pas annuler : un ordre posé cinq minutes avant un blackout serait à
 *     retirer à la main aussitôt ;
 *   - une cotation de plus d'un quart d'heure n'autorise rien — pour agir, le
 *     seuil est plus serré que pour prévenir ;
 *   - un ordre en attente au plus par paire, et rien si la paire a déjà tradé.
 */
import { prisma } from "@/lib/prisma";
import { pushAll } from "@/lib/push";
import { ageMin, cotations, ligneLaPlusProche } from "@/lib/quotes";
import { COTATION_MAX_MIN, MARGE_TICKS, RESTE_MIN, orderPrices, orderWindows, type Blocking, type PairPlan } from "@/lib/tradingPlan";
import { fmtPrice } from "@/lib/databento/format";

/**
 * Un tour de pose automatique. Renvoie ce qui a été posé, pour le journal du
 * serveur.
 */
export async function posesAutomatiques(now: number, plans: PairPlan[], blocking: Blocking[], day: string): Promise<string[]> {
  const [q, duJour] = await Promise.all([cotations(), prisma.planOrder.findMany({ where: { day } })]);
  const poses: string[] = [];

  for (const c of q) {
    const p = plans.find((x) => x.symbol === c.symbol);
    if (!p) continue;
    if (ageMin(c, now) > COTATION_MAX_MIN) continue;

    // Dans une fenêtre, et avec du temps devant : les news et les heures
    // écartées sont déjà hors des fenêtres.
    const w = orderWindows(p, day, blocking).find(([a, b]) => now >= a && now < b);
    if (!w || w[1] - now < RESTE_MIN * 60000) continue;

    // La paire est finie si elle a tradé, et occupée si elle a déjà un ordre.
    const siens = duJour.filter((o) => o.symbol === c.symbol);
    if (siens.some((o) => o.status === "filled" || o.status === "closed")) continue;
    if (siens.some((o) => o.status === "pending")) continue;

    const proche = ligneLaPlusProche(c.price, p.levels, p.tick);
    if (!proche || Math.abs(proche.ticks) > MARGE_TICKS) continue;
    // Une ligne déjà travaillée aujourd'hui, même annulée, ne se repose pas.
    if (siens.some((o) => Math.abs(o.level - proche.niveau) < p.tick / 2)) continue;

    /**
     * Le sens vient du côté d'où le prix arrive, comme le backtest le compte :
     * une ligne au-dessus du prix est une résistance, on y vend ; en dessous,
     * un support, on y achète.
     */
    const side: "Long" | "Short" = proche.ticks > 0 ? "Short" : "Long";
    const px = orderPrices(p, proche.niveau)[side === "Long" ? "buy" : "sell"];
    const o = await prisma.planOrder.create({
      data: { day, symbol: c.symbol, side, level: proche.niveau, entry: px.entry, sl: px.sl, tp1: px.tp1, tp2: px.tp2 },
    });
    poses.push(`${c.symbol} ${side} ${fmtPrice(proche.niveau, c.symbol, p.tick)}`);
    duJour.push(o);

    await pushAll({
      title: `Ordre posé tout seul · ${c.symbol} ${side === "Long" ? "achat" : "vente"}`,
      body: `Ligne ${fmtPrice(proche.niveau, c.symbol, p.tick)}, prix à ${Math.abs(proche.ticks)} ticks il y a ${ageMin(c, now)} min. Entrée ${fmtPrice(px.entry, c.symbol, p.tick)} · SL ${fmtPrice(px.sl, c.symbol, p.tick)}. Le bot le prend dans les 20 s.`,
      url: "/trading-plan",
      tag: `auto-${o.id}`,
    });
  }
  return poses;
}
