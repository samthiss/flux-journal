/**
 * What the agent may do, declared for the model and dispatched here.
 *
 * Read-only, every one of them. An agent that can write to the journal can
 * also corrupt it — reword a rule, overwrite one — and the damage would only
 * surface weeks later, while re-reading a note believed to be one's own. The
 * worst these can do is answer badly, and every answer carries the note it
 * came from, one click from being checked.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/uploadDir";
import {
  chercherNotes,
  imagesDe,
  interrogerTrades,
  lireChecklist,
  lireNote,
  lireVolumeAlert,
} from "@/lib/agent/journal";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "chercher_notes",
    description:
      "Cherche dans toutes les notes de trading : titres, catégories, blocs de règles, exemples et légendes d'images. " +
      "Rends la question entière, pas des mots-clés isolés : le classement s'appuie sur les expressions. " +
      "Ne renvoie rien quand rien ne correspond vraiment — c'est le signal que le sujet n'est pas écrit dans le journal.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "La question, telle quelle." },
      },
      required: ["question"],
    },
  },
  {
    name: "lire_note",
    description:
      "Lit une note entière : ses blocs, ses catégories, ses exemples et leurs légendes. " +
      "À utiliser après chercher_notes pour voir une règle dans son contexte, ou pour répondre à « quelles sont mes règles pour X ». " +
      "Une note qui ne contient que des captures le dit explicitement.",
    input_schema: {
      type: "object",
      properties: {
        chemin: { type: "string", description: "Le chemin ou le titre, ex. « Trend run » ou « Parametres > Box cluster »." },
      },
      required: ["chemin"],
    },
  },
  {
    name: "lister_images",
    description:
      "Liste les captures d'écran d'une note, avec leur légende. Ne les montre pas : sert à choisir laquelle regarder.",
    input_schema: {
      type: "object",
      properties: { chemin: { type: "string" } },
      required: ["chemin"],
    },
  },
  {
    name: "voir_image",
    description:
      "Regarde une capture d'écran, par son identifiant obtenu avec lister_images. " +
      "Une partie des règles de ce journal n'est écrite que sur des graphiques annotés : quand une note n'a pas de texte, c'est là qu'il faut regarder. " +
      "Coûteux — n'en ouvre pas plus de trois pour une question.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "interroger_trades",
    description:
      "Compte et résume les trades enregistrés : nombre, win rate, P&L cumulé, R:R moyen, jusqu'où le marché est allé (TP1/TP2/TP3). " +
      "Tous les filtres sont facultatifs et se combinent.",
    input_schema: {
      type: "object",
      properties: {
        symbole: { type: "string", description: "ex. 6B, 6E, ES" },
        setup: { type: "string", description: "ex. Trend run, Backtest reverse" },
        type: { type: "string", description: "un type de trade étiqueté" },
        zone: { type: "string" },
        confirmation: { type: "string" },
        tpAtteint: { type: "number", description: "1, 2 ou 3 : les trades que le marché a portés au moins jusque-là" },
        depuis: { type: "string", description: "AAAA-MM-JJ" },
        jusqua: { type: "string", description: "AAAA-MM-JJ" },
      },
    },
  },
  {
    name: "lire_volume_alert",
    description:
      "Les heures enregistrées dans Volume Alert : jour, tranche horaire, seuil réglé et valeurs des box qui ont déclenché. " +
      "Sert à confronter une règle écrite (« 1-3 clusters par heure ») à ce qui s'est réellement produit.",
    input_schema: {
      type: "object",
      properties: { marche: { type: "string", description: "ex. 6B — sinon tous" } },
    },
  },
  {
    name: "lire_checklist",
    description: "La checklist de préparation de séance, groupe par groupe.",
    input_schema: { type: "object", properties: {} },
  },
];

export type ToolResult = { texte?: string; image?: { media_type: string; data: string } };

/** Runs one tool call and returns what the model should read back. */
export async function runTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "chercher_notes": {
      const hits = await chercherNotes(String(input.question ?? ""));
      if (hits.length === 0) {
        return { texte: "Aucun passage du journal ne correspond. Le sujet n'est probablement pas écrit." };
      }
      return {
        texte: hits
          .map((hit) => `▸ ${hit.chemin} [${hit.ou}]\n${hit.extrait}`)
          .join("\n\n"),
      };
    }

    case "lire_note":
      return { texte: await lireNote(String(input.chemin ?? "")) };

    case "lister_images": {
      const images = await imagesDe(String(input.chemin ?? ""));
      if (images.length === 0) return { texte: "Cette note n'a aucune image." };
      return {
        texte: images
          .map((image) => `id ${image.id} — exemple « ${image.exemple || "sans titre" } » — ${image.legende || "sans légende"}`)
          .join("\n"),
      };
    }

    case "voir_image":
      return lireImage(String(input.id ?? ""));

    case "interroger_trades":
      return { texte: await interrogerTrades(input as Parameters<typeof interrogerTrades>[0]) };

    case "lire_volume_alert":
      return { texte: await lireVolumeAlert(input.marche ? String(input.marche) : undefined) };

    case "lire_checklist":
      return { texte: await lireChecklist() };

    default:
      return { texte: `Outil inconnu : ${name}` };
  }
}

/**
 * One screenshot, read off the volume and handed over as an image.
 *
 * The file name is taken from the row rather than from the model, and resolved
 * against the upload directory: an id is a database key here, never a path, so
 * nothing the model says can reach outside that folder.
 */
async function lireImage(id: string): Promise<ToolResult> {
  const { prisma } = await import("@/lib/prisma");
  const image = await prisma.noteExampleImage.findUnique({ where: { id }, select: { url: true } });
  if (!image) return { texte: `Aucune image avec l'identifiant ${id}.` };

  const nom = path.basename(image.url);
  try {
    const data = await readFile(path.join(UPLOAD_DIR, nom));
    const type = nom.endsWith(".png") ? "image/png" : nom.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return { image: { media_type: type, data: data.toString("base64") } };
  } catch {
    return { texte: `Le fichier de cette image est introuvable (${nom}).` };
  }
}
