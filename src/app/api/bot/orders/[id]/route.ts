import { refus, reponseDuBot } from "@/lib/botOrders";

/**
 * L'accusé de réception du bot, ordre par ordre.
 *
 *   POST /api/bot/orders/<id>   { "fait": "pose" }
 *   POST /api/bot/orders/<id>   { "fait": "retrait" }
 *   POST /api/bot/orders/<id>   { "fait": "pose", "erreur": "marge insuffisante" }
 *
 * C'est cet appel qui marque la ligne dans Ordres du jour et déclenche la
 * notification sur le téléphone : le journal ne suppose jamais qu'un ordre est
 * passé, il attend que le bot le dise.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const non = refus(req);
  if (non) return non;
  const { id } = await ctx.params;

  let corps: { fait?: unknown; erreur?: unknown };
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: "Corps illisible." }, { status: 400 });
  }
  const fait = corps.fait;
  if (fait !== "pose" && fait !== "retrait") return Response.json({ error: 'fait doit être "pose" ou "retrait".' }, { status: 400 });
  const erreur = typeof corps.erreur === "string" && corps.erreur.trim() ? corps.erreur.trim() : undefined;

  const r = await reponseDuBot(id, fait, erreur);
  return Response.json(r.corps, { status: r.status });
}
