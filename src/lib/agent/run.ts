/**
 * The agent: a loop around one model and seven read-only tools.
 *
 * Nothing here decides what is true about the journal — the tools do, and this
 * only carries their results back and forth until the model has an answer. The
 * prompt below is therefore the whole of the discipline: cite what you used,
 * and say when something is not written rather than filling the gap with what
 * a trading journal usually says. A plausible rule that is not the reader's own
 * is worse than no answer, because it will be followed.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, runTool } from "@/lib/agent/tools";

const MODEL = "claude-sonnet-5";

/** How many times the model may call tools before it has to answer. */
const MAX_TOURS = 8;

const CONSIGNES = `Tu es l'agent d'un journal de trading personnel, en français.

Ta seule source est ce journal, à travers tes outils. Tu ne sais rien des marchés
d'aujourd'hui, tu ne donnes aucun conseil de trading, tu ne proposes aucune règle
générale : tu restitues et tu croises ce que cette personne a écrit et mesuré.

Règles de travail :

1. Cherche avant de répondre. Passe la question entière à chercher_notes, puis
   lis la note entière quand un extrait mérite son contexte.
2. Cite toujours. Termine par les chemins exacts utilisés, sous la forme
   « Sources : Trend run › Règles ». Sans citation, la personne ne peut pas
   distinguer ce qu'elle a écrit de ce que tu as supposé.
3. Quand ce n'est pas écrit, dis-le franchement : « ce n'est pas dans ton
   journal ». N'invente jamais une règle plausible. C'est la consigne la plus
   importante : une règle inventée sera suivie.
4. Une partie du savoir n'existe que sur des captures annotées. Quand une note
   n'a pas de texte, liste ses images et regarde les plus prometteuses.
5. Pour les questions chiffrées, utilise interroger_trades plutôt que de
   compter à la main, et donne les chiffres tels qu'ils reviennent.
6. Reste bref. Trois à six phrases, la règle d'abord, les nuances ensuite.
   Reprends les mots de la personne : c'est son vocabulaire, pas le tien.`;

export type Etape =
  | { type: "outil"; nom: string; entree: unknown }
  | { type: "texte"; texte: string };

/**
 * Answers one question, reporting each step as it happens.
 *
 * `onEtape` is what lets a page show "cherche dans les notes…" instead of a
 * blank wait: a question that opens an image takes several seconds and several
 * round trips, and silence during that reads as a failure.
 */
export async function demander(
  question: string,
  onEtape: (etape: Etape) => void = () => {},
): Promise<{ reponse: string; outils: string[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const outils: string[] = [];

  for (let tour = 0; tour < MAX_TOURS; tour++) {
    const reponse = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      // Cached: the instructions and the tool definitions are identical from
      // one question to the next, and re-reading them costs a tenth.
      system: [{ type: "text", text: CONSIGNES, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    const demandes = reponse.content.filter((bloc): bloc is Anthropic.ToolUseBlock => bloc.type === "tool_use");

    if (demandes.length === 0) {
      const texte = reponse.content
        .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
        .map((bloc) => bloc.text)
        .join("\n")
        .trim();
      onEtape({ type: "texte", texte });
      return { reponse: texte, outils };
    }

    messages.push({ role: "assistant", content: reponse.content });

    const resultats: Anthropic.ToolResultBlockParam[] = [];
    for (const demande of demandes) {
      outils.push(demande.name);
      onEtape({ type: "outil", nom: demande.name, entree: demande.input });

      const resultat = await runTool(demande.name, (demande.input ?? {}) as Record<string, unknown>);
      resultats.push({
        type: "tool_result",
        tool_use_id: demande.id,
        content: resultat.image
          ? [{ type: "image", source: { type: "base64", media_type: resultat.image.media_type as "image/png", data: resultat.image.data } }]
          : [{ type: "text", text: resultat.texte ?? "" }],
      });
    }

    messages.push({ role: "user", content: resultats });
  }

  // Eight rounds without an answer means the question cannot be settled from
  // the journal; saying so beats a ninth round.
  return {
    reponse: "Je n'arrive pas à répondre à partir de ton journal — la question demande sans doute des notes qui ne s'y trouvent pas.",
    outils,
  };
}
