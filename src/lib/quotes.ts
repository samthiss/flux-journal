/**
 * Où est le marché, d'après une source gratuite et différée.
 *
 * Sert à une seule chose : dire que le prix approche d'une ligne du plan, pour
 * que l'ordre soit posé à temps. Pas à savoir si un ordre est rempli — avec
 * une dizaine de minutes de retard, ça se saurait trop tard.
 *
 * La source est l'endpoint de graphiques de Yahoo, le seul qui réponde sans
 * authentification (ceux qui annoncent le délai renvoient 401). Il n'a donc
 * aucune garantie : il peut changer ou fermer sans prévenir. D'où deux règles
 * tenues partout — l'âge de la cotation est affiché à côté du prix, et rien
 * au-delà d'une demi-heure ne déclenche de notification. Un flux cassé doit
 * se voir, pas ressembler à un marché immobile.
 *
 * Le contrat de tête est celui de Yahoo, pas forcément celui du backtest : un
 * jour de roll, les deux peuvent différer d'un contrat et donc de l'écart de
 * portage. À 20 ticks près, sur une alerte d'approche, c'est supportable.
 */
import { prisma } from "@/lib/prisma";

/** Les symboles de Yahoo pour les marchés du journal. */
const YAHOO: Record<string, string> = {
  "6B": "6B=F",
  "6E": "6E=F",
  "6J": "6J=F",
  "6N": "6N=F",
  "6C": "6C=F",
  ZN: "ZN=F",
  ZS: "ZS=F",
  ZW: "ZW=F",
};

/** Au-delà, la cotation est trop vieille pour qu'on en tire une alerte. */
export const COTATION_PERIMEE_MIN = 30;

export type Cotation = { symbol: string; price: number; at: Date; fetchedAt: Date; error: string | null };

/** L'âge de la cotation en minutes, d'après son propre horodatage. */
export const ageMin = (q: { at: Date }, maintenant = Date.now()) => Math.round((maintenant - q.at.getTime()) / 60000);

async function une(symbol: string): Promise<{ price: number; at: Date } | string> {
  const y = YAHOO[symbol];
  if (!y) return `pas de symbole connu pour ${symbol}`;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=1m&range=1d`, {
      // Un nom de client générique : rien du journal ni de son propriétaire ne
      // part vers une adresse extérieure.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; flux-journal)", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!r.ok) return `HTTP ${r.status}`;
    const j = (await r.json()) as { chart?: { result?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number } }[] } };
    const m = j.chart?.result?.[0]?.meta;
    if (typeof m?.regularMarketPrice !== "number" || !m.regularMarketTime) return "réponse sans prix";
    return { price: m.regularMarketPrice, at: new Date(m.regularMarketTime * 1000) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes("timeout") || msg.includes("abort") ? "pas de réponse en 12 s" : msg.slice(0, 120);
  }
}

/**
 * Relève les prix demandés, un par un.
 *
 * Séquentiel et non en parallèle : huit appels d'un coup sur un endpoint sans
 * contrat, toutes les cinq minutes, c'est le genre de chose qui fait fermer la
 * porte. Un échec par marché est écrit dans sa ligne sans effacer le dernier
 * prix connu — mieux vaut un prix daté qu'aucun prix.
 */
export async function releverCotations(symbols: string[]): Promise<void> {
  for (const symbol of symbols) {
    const r = await une(symbol);
    const fetchedAt = new Date();
    if (typeof r === "string") {
      await prisma.marketQuote.updateMany({ where: { symbol }, data: { error: r, fetchedAt } });
      // Rien en base encore : on garde la trace de l'échec avec un prix nul,
      // que `cotations` écarte.
      const existe = await prisma.marketQuote.findUnique({ where: { symbol } });
      if (!existe) await prisma.marketQuote.create({ data: { symbol, price: 0, at: new Date(0), fetchedAt, error: r } });
      continue;
    }
    await prisma.marketQuote.upsert({
      where: { symbol },
      create: { symbol, price: r.price, at: r.at, fetchedAt, error: null },
      update: { price: r.price, at: r.at, fetchedAt, error: null },
    });
  }
}

/** Les cotations connues, les lignes sans prix écartées. */
export async function cotations(): Promise<Cotation[]> {
  return (await prisma.marketQuote.findMany()).filter((q) => q.price > 0);
}

/** La ligne la plus proche du prix, et la distance en ticks (positive = au-dessus). */
export function ligneLaPlusProche(prix: number, niveaux: number[], tick: number): { niveau: number; ticks: number } | null {
  if (!niveaux.length) return null;
  const niveau = niveaux.reduce((a, b) => (Math.abs(b - prix) < Math.abs(a - prix) ? b : a));
  return { niveau, ticks: Math.round((niveau - prix) / tick) };
}
