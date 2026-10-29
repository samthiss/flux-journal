"use client";

import { useState } from "react";
import { accentColor, glassCard } from "@/lib/theme";

export type Commentaire = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  source: string;
};

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;
const NOM = "flux.commentaire.nom";

/**
 * What the people a journal is shared with can say back.
 *
 * A trading journal shown to someone is shown to be answered — "why there?",
 * "that stop was early" — and an answer that lands in a chat somewhere is an
 * answer nobody finds again beside the trade it was about.
 *
 * Whoever holds a share link signs with a name they type once, kept in their
 * own browser; an account signs with the address it was made with, and the
 * owner signs as themselves. None of it is proof of anything, and none of it
 * is meant to be: it is a signature on a remark.
 */
export default function TradeComments({
  tradeId,
  initiaux,
  token,
  proprietaire = false,
}: {
  tradeId: string;
  initiaux: Commentaire[];
  /** The share link this page was opened through, when it was. */
  token?: string;
  proprietaire?: boolean;
}) {
  const [commentaires, setCommentaires] = useState(initiaux);
  const [texte, setTexte] = useState("");
  const [nom, setNom] = useState(() => {
    try {
      return window.localStorage.getItem(NOM) ?? "";
    } catch {
      return "";
    }
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // The owner signs as themselves and an account by its address; only a link
  // has nobody to ask but the person holding it.
  const demandeNom = !proprietaire && !!token;

  async function envoyer() {
    const corps = texte.trim();
    if (!corps || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, body: corps, author: nom, token }),
      });
      if (!reponse.ok) {
        // What the server said, rather than a shrug: a comment that will not
        // go through is either a link that has been closed or a journal that
        // is broken, and those two are not fixed the same way.
        const dit = await reponse.text();
        let message = dit.slice(0, 200);
        try {
          message = (JSON.parse(dit) as { error?: string }).error ?? message;
        } catch {
          // Not JSON: whatever came back is shown as it is.
        }
        throw new Error(`${reponse.status} — ${message}`);
      }
      const { comment } = await reponse.json();
      setCommentaires((prev) => [...prev, comment]);
      setTexte("");
      if (demandeNom && nom) {
        try {
          window.localStorage.setItem(NOM, nom);
        } catch {
          // A name that cannot be remembered is typed again; nothing is lost.
        }
      }
    } catch (e) {
      setErreur(`The comment did not go through: ${e instanceof Error ? e.message : "no answer"}`);
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(id: string) {
    setCommentaires((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // It is gone from the page either way; the next load tells the truth.
    }
  }

  const champ = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid oklch(0.34 0.034 250)",
    background: "oklch(0.16 0.03 250)",
    color: "oklch(0.9 0.017 250)",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ ...glassCard, marginTop: 18 }}>
      <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
        Comments
      </div>

      {commentaires.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)", marginBottom: 14 }}>
          Nothing said about this trade yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {commentaires.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid oklch(0.3 0.034 250)",
                background: "oklch(0.17 0.03 250 / 0.6)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 11, color: c.source === "owner" ? accentColor : "oklch(0.75 0.03 250)" }}>
                  {c.author}
                </span>
                <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)" }}>
                  {new Date(c.createdAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {proprietaire && (
                  <span
                    onClick={() => void supprimer(c.id)}
                    title="Delete this comment"
                    style={{ marginLeft: "auto", fontSize: 12, color: "oklch(0.5 0.03 250)", cursor: "pointer" }}
                  >
                    ✕
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13.5, color: "oklch(0.88 0.017 250)", marginTop: 6, whiteSpace: "pre-wrap" }}>
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {demandeNom && (
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Your name"
            style={{ ...champ, maxWidth: 260 }}
          />
        )}
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; a remark is a line or two, and reaching for a
            // button for every one of them is how they stop being written.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void envoyer();
            }
          }}
          rows={2}
          placeholder="Leave a comment…"
          style={{ ...champ, resize: "vertical", lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => void envoyer()}
            disabled={envoi || !texte.trim()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: accentColor,
              color: "oklch(0.15 0.034 250)",
              fontSize: 13,
              fontWeight: 600,
              cursor: envoi || !texte.trim() ? "default" : "pointer",
              opacity: envoi || !texte.trim() ? 0.5 : 1,
            }}
          >
            {envoi ? "…" : "Comment"}
          </button>
          {erreur && <span style={{ fontSize: 12, color: "oklch(0.7 0.25 18)" }}>{erreur}</span>}
        </div>
      </div>
    </div>
  );
}
