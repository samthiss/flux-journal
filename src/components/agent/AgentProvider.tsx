"use client";

/**
 * The conversation, held above both places that show it.
 *
 * The agent can be reached from a panel on any page and from its own page, and
 * a question asked in one has to be there in the other — a thread that resets
 * when you walk from the checklist to the notes is a thread nobody follows.
 * So the state lives here, at the root, and both views read it.
 *
 * It survives a reload too, in session storage: the answers were paid for, and
 * losing them to a refresh would teach the reader not to rely on them.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ajouterLigne } from "@/lib/agent/ecrire";

export type Brouillon = { note: string; section: string; ligne: string; etat: string };

export type Message = {
  role: "moi" | "agent";
  texte: string;
  /** What the agent consulted, in order, for its own answer. */
  etapes?: string[];
  /** What it offers to write, if anything. Nothing is written without a click. */
  brouillons?: Brouillon[];
};

type Agent = {
  messages: Message[];
  encours: string | null;
  ouvert: boolean;
  setOuvert: (ouvert: boolean) => void;
  envoyer: (question: string) => void;
  accepter: (message: number, brouillon: number) => void;
  refuser: (message: number, brouillon: number) => void;
  vider: () => void;
};

const Contexte = createContext<Agent | null>(null);

export function useAgent(): Agent {
  const agent = useContext(Contexte);
  if (!agent) throw new Error("useAgent en dehors de AgentProvider");
  return agent;
}

/** What each tool is doing, in words, while it does it. */
const EN_COURS: Record<string, string> = {
  chercher_notes: "cherche dans les notes",
  lire_note: "lit une note en entier",
  lister_images: "regarde quelles captures existent",
  voir_image: "ouvre une capture",
  interroger_trades: "interroge les trades",
  lire_volume_alert: "lit les heures de Volume Alert",
  lire_checklist: "lit la checklist",
  proposer_ajout: "prépare un ajout",
};

const STORE = "flux.agent.fil";

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [encours, setEncours] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);

  // Read after mount, never during render: the server draws this page too and
  // has no session storage to read.
  const charge = useRef(false);
  useEffect(() => {
    if (charge.current) return;
    charge.current = true;
    try {
      const garde = sessionStorage.getItem(STORE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from storage after mount
      if (garde) setMessages(JSON.parse(garde) as Message[]);
    } catch {
      // A private window, or storage turned off: the thread simply starts empty.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages));
    } catch {
      // Not worth telling anyone about: the thread still works this session.
    }
  }, [messages]);

  /** The last message, rewritten. Every update to a streaming answer goes here. */
  const majDernier = useCallback((change: (message: Message) => Message) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copie = [...prev];
      copie[copie.length - 1] = change(copie[copie.length - 1]);
      return copie;
    });
  }, []);

  const envoyer = useCallback(
    async (question: string) => {
      const posee = question.trim();
      if (!posee || encours !== null) return;

      // Sent before the new turn is added, and only the prose: this is what the
      // agent reads as "what was already said".
      const historique = messages.map(({ role, texte }) => ({ role, texte }));

      setMessages((prev) => [...prev, { role: "moi", texte: posee }, { role: "agent", texte: "", etapes: [] }]);
      setEncours("réfléchit");

      try {
        const reponse = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: posee, historique }),
        });

        if (!reponse.ok || !reponse.body) {
          const { erreur } = await reponse.json().catch(() => ({ erreur: "Le serveur n'a pas répondu." }));
          throw new Error(erreur);
        }

        const lecteur = reponse.body.getReader();
        const decodeur = new TextDecoder();
        let reste = "";

        for (;;) {
          const { done, value } = await lecteur.read();
          if (done) break;

          // One JSON object per line, and the last of a chunk is usually cut in
          // half — it waits here for the rest of itself.
          reste += decodeur.decode(value, { stream: true });
          const lignes = reste.split("\n");
          reste = lignes.pop() ?? "";

          for (const ligne of lignes) {
            if (!ligne.trim()) continue;
            const etape = JSON.parse(ligne) as { type: string; texte?: string; nom?: string; entree?: unknown };

            if (etape.type === "outil") {
              setEncours(EN_COURS[etape.nom ?? ""] ?? etape.nom ?? "cherche");
              const brouillon = etape.nom === "proposer_ajout" ? (etape.entree as Brouillon | undefined) : undefined;

              majDernier((message) => ({
                ...message,
                // A blank line before the model speaks again: between two turns
                // it often says what it is about to do, and without this the
                // sentence ran into the answer — "…pour voir la règle.La règle".
                texte: message.texte && !message.texte.endsWith("\n\n") ? `${message.texte.trimEnd()}\n\n` : message.texte,
                etapes: [...(message.etapes ?? []), etape.nom ?? ""],
                brouillons: brouillon?.ligne
                  ? [...(message.brouillons ?? []), { ...brouillon, etat: "attente" }]
                  : message.brouillons,
              }));
            }

            if (etape.type === "mot") {
              setEncours(null);
              majDernier((message) => ({ ...message, texte: message.texte + (etape.texte ?? "") }));
            }

            if (etape.type === "erreur") throw new Error(etape.texte);
          }
        }
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
        majDernier(() => ({ role: "agent", texte: `⚠ ${message}` }));
      } finally {
        setEncours(null);
      }
    },
    [encours, majDernier, messages],
  );

  const majBrouillon = useCallback((message: number, brouillon: number, etat: string) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === message ? { ...m, brouillons: m.brouillons?.map((b, j) => (j === brouillon ? { ...b, etat } : b)) } : m,
      ),
    );
  }, []);

  /** Writes the line, from the button and from nowhere else. */
  const accepter = useCallback(
    async (message: number, brouillon: number) => {
      const cible = messages[message]?.brouillons?.[brouillon];
      if (!cible) return;

      majBrouillon(message, brouillon, "enregistre…");
      try {
        majBrouillon(message, brouillon, await ajouterLigne(cible));
      } catch {
        majBrouillon(message, brouillon, "⚠ l'ajout a échoué");
      }
    },
    [majBrouillon, messages],
  );

  const refuser = useCallback(
    (message: number, brouillon: number) => majBrouillon(message, brouillon, "écarté"),
    [majBrouillon],
  );

  const vider = useCallback(() => setMessages([]), []);

  return (
    <Contexte.Provider value={{ messages, encours, ouvert, setOuvert, envoyer, accepter, refuser, vider }}>
      {children}
    </Contexte.Provider>
  );
}
