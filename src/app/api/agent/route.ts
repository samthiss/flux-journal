/**
 * The agent, as a stream of events.
 *
 * One JSON object per line rather than server-sent events: the page reads it
 * with a plain fetch and a text decoder, there is nothing to reconnect to, and
 * a question is a single request that ends when the answer does.
 *
 * Each line is a step — a tool being called, a fragment of the answer — so the
 * page can say "cherche dans les notes…" while the model works. A question
 * that opens two screenshots takes fifteen seconds.
 */

import { demander, type Etape } from "@/lib/agent/run";

export const dynamic = "force-dynamic";
// The loop can take four or five round trips through the model.
export const maxDuration = 120;

export async function POST(request: Request) {
  const { question, historique } = (await request.json()) as {
    question?: string;
    historique?: { role: "moi" | "agent"; texte: string }[];
  };
  if (!question?.trim()) {
    return new Response(JSON.stringify({ erreur: "Pose une question." }), { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ erreur: "La clé ANTHROPIC_API_KEY n'est pas configurée sur ce serveur." }),
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const flux = new ReadableStream({
    async start(controller) {
      const envoyer = (etape: Etape | { type: "erreur"; texte: string }) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(etape)}\n`));

      try {
        await demander(question, envoyer, historique ?? []);
      } catch (erreur) {
        // Surfaced rather than swallowed: a missing credit, a rate limit and a
        // bug all end the stream, and only the message says which.
        envoyer({ type: "erreur", texte: erreur instanceof Error ? erreur.message : "Erreur inconnue" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(flux, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
