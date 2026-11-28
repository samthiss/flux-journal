import { refus, travailDuBot } from "@/lib/botOrders";

/**
 * Ce que le bot d'exécution doit faire : les ordres à poser, ceux à retirer.
 *
 * Une route et non une action serveur : le script Python n'a pas de session,
 * il porte une clé partagée dans l'en-tête `X-Bot-Key`. Sans `BOT_API_KEY`
 * côté serveur, la porte est fermée (503) et non ouverte — une clé absente ne
 * doit jamais valoir autorisation.
 *
 *   curl -H "X-Bot-Key: …" https://…/api/bot/orders
 */
export async function GET(req: Request) {
  const non = refus(req);
  if (non) return non;
  const travail = await travailDuBot();
  return Response.json(travail, { headers: { "Cache-Control": "no-store" } });
}
