"use client";

/**
 * The conversation, drawn.
 *
 * Holds no state of its own: the same exchange is shown here whether it is
 * read in the side panel or on the agent's own page, so everything lives in
 * the provider and this only renders it.
 */

import { useEffect, useRef, useState } from "react";
import { accentColor, glassCard, lossColor, winColor } from "@/lib/theme";
import { useAgent } from "@/components/agent/AgentProvider";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

const EXEMPLES = [
  "Combien de box cluster je veux voir par heure ?",
  "Rappelle-moi mes confirmations pour Trend run",
  "Mon win rate en Trend run sur 6B ?",
  "Qu'est-ce qui revient dans mes dernières notes d'après-coup ?",
];

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

export default function AgentConversation({ compact = false }: { compact?: boolean }) {
  const { messages, encours, envoyer, accepter, refuser, vider } = useAgent();
  const [question, setQuestion] = useState("");
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, encours]);

  const poser = (texte: string) => {
    envoyer(texte);
    setQuestion("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: compact ? "100%" : 820, minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: compact ? "auto" : "visible", flex: 1, minHeight: 0 }}>
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
                  onClick={() => poser(exemple)}
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
                ? { ...glassCard, padding: "12px 16px", alignSelf: "flex-end", maxWidth: "85%", background: "oklch(0.72 0.14 195 / 0.1)" }
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

            <div
              style={{
                fontSize: compact ? 13 : 14,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                color: message.texte.startsWith("⚠") ? lossColor : undefined,
              }}
            >
              {message.texte ? enRiche(message.texte) : encours ? "" : "…"}
            </div>

            {message.brouillons?.map((brouillon, j) => (
              <div
                key={j}
                style={{
                  marginTop: 14,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px dashed ${brouillon.etat === "attente" ? accentColor : "oklch(0.34 0.02 250)"}`,
                  background: "oklch(0.16 0.02 250 / 0.6)",
                }}
              >
                <div style={{ ...mono, fontSize: 10, color: "oklch(0.55 0.02 250)", marginBottom: 6 }}>
                  {brouillon.note} › {brouillon.section}
                </div>
                <div style={{ fontSize: 13.5, marginBottom: 10 }}>• {brouillon.ligne}</div>

                {brouillon.etat === "attente" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => accepter(i, j)}
                      style={{
                        ...mono,
                        fontSize: 11,
                        padding: "4px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        border: `1px solid ${accentColor}`,
                        background: "oklch(0.72 0.14 195 / 0.16)",
                        color: accentColor,
                      }}
                    >
                      Ajouter à la note
                    </button>
                    <button
                      onClick={() => refuser(i, j)}
                      style={{
                        ...mono,
                        fontSize: 11,
                        padding: "4px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        border: "1px solid oklch(0.32 0.02 250)",
                        background: "transparent",
                        color: "oklch(0.55 0.02 250)",
                      }}
                    >
                      Non
                    </button>
                  </div>
                ) : (
                  <div style={{ ...mono, fontSize: 11, color: brouillon.etat.startsWith("Ajouté") ? winColor : "oklch(0.55 0.02 250)" }}>
                    {brouillon.etat}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {encours && <div style={{ ...mono, fontSize: 11, color: accentColor }}>{encours}…</div>}
        <div ref={bas} />
      </div>

      <div style={{ display: "flex", gap: 8, flex: "none" }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && poser(question)}
          placeholder="Pose une question sur ton journal…"
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: "border-box",
            background: "oklch(0.18 0.034 250)",
            border: "1px solid oklch(0.32 0.051 250 / 0.6)",
            borderRadius: 8,
            padding: "11px 14px",
            fontSize: compact ? 13 : 14,
            color: "oklch(0.96 0.0068 250)",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}
        />
        <button
          onClick={() => poser(question)}
          disabled={encours !== null || !question.trim()}
          style={{
            fontSize: 13,
            padding: compact ? "0 14px" : "0 20px",
            borderRadius: 8,
            cursor: encours !== null || !question.trim() ? "default" : "pointer",
            border: `1px solid ${accentColor}`,
            background: "oklch(0.72 0.14 195 / 0.16)",
            color: accentColor,
            opacity: encours !== null || !question.trim() ? 0.4 : 1,
            flex: "none",
          }}
        >
          {compact ? "→" : "Demander"}
        </button>
        {messages.length > 0 && (
          <button
            onClick={vider}
            title="Repartir d'une conversation vide — tout le fil est renvoyé à chaque question, donc il coûte de plus en plus cher"
            style={{
              ...mono,
              fontSize: 11,
              padding: "0 12px",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid oklch(0.32 0.02 250)",
              background: "transparent",
              color: "oklch(0.55 0.02 250)",
              flex: "none",
            }}
          >
            vider
          </button>
        )}
      </div>
    </div>
  );
}
