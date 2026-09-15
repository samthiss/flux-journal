"use client";

import { useEffect, useRef, useState } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/**
 * The answer, with its bold runs made bold.
 *
 * The model marks emphasis with asterisks, and a journal answer leans on it —
 * the rule itself is what gets emphasised, and printing "**1 à 3 par heure**"
 * puts the noise exactly where the eye is meant to land. Nothing else of
 * markdown is interpreted: this is prose, not a document.
 */
function enRiche(texte: string) {
  return texte.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
    morceau.startsWith("**") && morceau.endsWith("**") && morceau.length > 4 ? (
      <strong key={i}>{morceau.slice(2, -2)}</strong>
    ) : (
      morceau
    ),
  );
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
};

type Message = {
  role: "moi" | "agent";
  texte: string;
  /** What the agent consulted, in order, for its own answer. */
  etapes?: string[];
};

const EXEMPLES = [
  "Combien de box cluster je veux voir par heure ?",
  "Rappelle-moi mes confirmations pour Trend run",
  "Mon win rate en Trend run sur 6B ?",
  "Qu'est-ce qui revient dans mes dernières notes d'après-coup ?",
];

/**
 * The journal, asked questions.
 *
 * Every answer ends in the notes it came from, because the one failure worth
 * guarding against is not a wrong answer — it is a plausible rule that was
 * never written, taken for one's own and then followed. The trail of what was
 * consulted is shown for the same reason.
 */
export default function AgentClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [encours, setEncours] = useState<string | null>(null);
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, encours]);

  async function envoyer(texte: string) {
    const posee = texte.trim();
    if (!posee || encours !== null) return;

    setQuestion("");
    setMessages((prev) => [...prev, { role: "moi", texte: posee }, { role: "agent", texte: "", etapes: [] }]);
    setEncours("réfléchit");

    try {
      const reponse = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: posee }),
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

        // One JSON object per line, and the last one of a chunk is usually cut
        // in half — it waits here for the rest of itself.
        reste += decodeur.decode(value, { stream: true });
        const lignes = reste.split("\n");
        reste = lignes.pop() ?? "";

        for (const ligne of lignes) {
          if (!ligne.trim()) continue;
          const etape = JSON.parse(ligne) as { type: string; texte?: string; nom?: string };

          if (etape.type === "outil") {
            setEncours(EN_COURS[etape.nom ?? ""] ?? etape.nom ?? "cherche");
            setMessages((prev) => {
              const copie = [...prev];
              const dernier = copie[copie.length - 1];
              // A blank line before the model speaks again. It often says what
              // it is about to do — "je vais regarder les captures" — and
              // without this the sentence ran straight into the answer that
              // followed the tool call: "…pour voir la règle.La règle est…".
              const texte = dernier.texte && !dernier.texte.endsWith("\n\n") ? `${dernier.texte.trimEnd()}\n\n` : dernier.texte;
              copie[copie.length - 1] = { ...dernier, texte, etapes: [...(dernier.etapes ?? []), etape.nom ?? ""] };
              return copie;
            });
          }

          if (etape.type === "mot") {
            setEncours(null);
            setMessages((prev) => {
              const copie = [...prev];
              const dernier = copie[copie.length - 1];
              copie[copie.length - 1] = { ...dernier, texte: dernier.texte + (etape.texte ?? "") };
              return copie;
            });
          }

          if (etape.type === "erreur") throw new Error(etape.texte);
        }
      }
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
      setMessages((prev) => {
        const copie = [...prev];
        copie[copie.length - 1] = { role: "agent", texte: `⚠ ${message}` };
        return copie;
      });
    } finally {
      setEncours(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      {messages.length === 0 && (
        <div style={{ ...glassCard }}>
          <div style={{ fontSize: 13, marginBottom: 12, color: "oklch(0.75 0.02 250)" }}>
            Il ne connaît que ton journal : tes notes, tes captures, tes trades, tes heures de Volume Alert.
            Il cite d&apos;où vient chaque réponse, et dit quand une chose n&apos;y est pas écrite.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXEMPLES.map((exemple) => (
              <button
                key={exemple}
                onClick={() => envoyer(exemple)}
                style={{
                  ...mono,
                  fontSize: 11,
                  padding: "5px 11px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: "1px dashed oklch(0.34 0.02 250)",
                  background: "transparent",
                  color: "oklch(0.62 0.02 250)",
                  textAlign: "left",
                }}
              >
                {exemple}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((message, i) => (
        <div
          key={i}
          style={
            message.role === "moi"
              ? { ...glassCard, padding: "12px 16px", alignSelf: "flex-end", maxWidth: "80%", background: "oklch(0.72 0.14 195 / 0.1)" }
              : { ...glassCard, padding: "16px 18px" }
          }
        >
          {message.role === "agent" && (message.etapes?.length ?? 0) > 0 && (
            <div style={{ ...mono, fontSize: 10, color: "oklch(0.5 0.02 250)", marginBottom: 10 }}>
              {message.etapes!.map((nom, j) => (
                <span key={j}>
                  {j > 0 && " → "}
                  {nom}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", color: message.texte.startsWith("⚠") ? lossColor : undefined }}>
            {message.texte ? enRiche(message.texte) : encours ? "" : "…"}
          </div>
        </div>
      ))}

      {encours && (
        <div style={{ ...mono, fontSize: 11, color: accentColor }}>{encours}…</div>
      )}

      <div ref={bas} />

      <div style={{ display: "flex", gap: 10, position: "sticky", bottom: 0, paddingBottom: 4 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer(question)}
          placeholder="Pose une question sur ton journal…"
          style={{
            flex: 1,
            boxSizing: "border-box",
            background: "oklch(0.18 0.034 250)",
            border: "1px solid oklch(0.32 0.051 250 / 0.6)",
            borderRadius: 8,
            padding: "11px 14px",
            fontSize: 14,
            color: "oklch(0.96 0.0068 250)",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}
        />
        <button
          onClick={() => envoyer(question)}
          disabled={encours !== null || !question.trim()}
          style={{
            fontSize: 13,
            padding: "0 20px",
            borderRadius: 8,
            cursor: encours !== null || !question.trim() ? "default" : "pointer",
            border: `1px solid ${accentColor}`,
            background: "oklch(0.72 0.14 195 / 0.16)",
            color: accentColor,
            opacity: encours !== null || !question.trim() ? 0.4 : 1,
          }}
        >
          Demander
        </button>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            title="Repartir d'une conversation vide — l'historique est renvoyé à chaque question, donc il coûte de plus en plus cher"
            style={{
              ...mono,
              fontSize: 11,
              padding: "0 12px",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid oklch(0.32 0.02 250)",
              background: "transparent",
              color: "oklch(0.55 0.02 250)",
            }}
          >
            vider
          </button>
        )}
      </div>
    </div>
  );
}
