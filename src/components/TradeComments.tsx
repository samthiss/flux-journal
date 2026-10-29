"use client";

import { useEffect, useState } from "react";
import { accentColor, glassCard } from "@/lib/theme";

export type Commentaire = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  source: string;
};

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;
const MIENS = "flux.commentaires.miens";

/** The comments written from this browser, so they can be taken back. */
function miens(): string[] {
  try {
    const brut = window.localStorage.getItem(MIENS);
    return brut ? (JSON.parse(brut) as string[]) : [];
  } catch {
    return [];
  }
}

function noteLeSien(id: string) {
  try {
    window.localStorage.setItem(MIENS, JSON.stringify([...miens(), id].slice(-200)));
  } catch {
    // Then it stays as written, which is the safe way to be wrong here.
  }
}

/**
 * What the people a journal is shared with can say back.
 *
 * A trading journal shown to someone is shown to be answered — "why there?",
 * "that stop was early" — and an answer that lands in a chat somewhere is an
 * answer nobody finds again beside the trade it was about.
 *
 * A remark is a note on a card, not a line in a log: each sits in its own box,
 * and clicking one's own opens it to be rewritten. Second thoughts about a
 * trade are the normal case, and a thread that can only be appended to turns
 * them into a correction underneath the thing being corrected.
 *
 * Nobody is asked who they are. The owner's remarks are the owner's and the
 * rest are a guest's, which is all a name could have said here anyway: a typed
 * name is not proof of anything, and asking for one is one more field between
 * having something to say and saying it. What this browser wrote it remembers,
 * and that is what decides which boxes open.
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
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Which box is open for rewriting, and what it says while it is.
  const [modifie, setModifie] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  // Read after mount, through a state the first render does not depend on:
  // the server has no idea what this browser wrote, and a box that opened
  // during hydration and closed again would be worse than one that opens a
  // moment late.
  const [aMoi, setAMoi] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read from localStorage after mount
    setAMoi(miens());
  }, []);

  const peutModifier = (c: Commentaire) => proprietaire || aMoi.includes(c.id);

  /** Says what went wrong in the words the server used. */
  async function echec(reponse: Response) {
    const dit = await reponse.text();
    let message = dit.slice(0, 200);
    try {
      message = (JSON.parse(dit) as { error?: string }).error ?? message;
    } catch {
      // Not JSON: whatever came back is shown as it is.
    }
    return new Error(`${reponse.status} — ${message}`);
  }

  async function envoyer() {
    const corps = texte.trim();
    if (!corps || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, body: corps, token }),
      });
      if (!reponse.ok) throw await echec(reponse);
      const { comment } = (await reponse.json()) as { comment: Commentaire };
      setCommentaires((prev) => [...prev, comment]);
      setAMoi((prev) => [...prev, comment.id]);
      noteLeSien(comment.id);
      setTexte("");
      setOuvert(false);
    } catch (e) {
      setErreur(`The comment did not go through: ${e instanceof Error ? e.message : "no answer"}`);
    } finally {
      setEnvoi(false);
    }
  }

  async function enregistrer(id: string) {
    const corps = brouillon.trim();
    const avant = commentaires.find((c) => c.id === id);
    if (!avant) return;
    if (!corps || corps === avant.body) {
      setModifie(null);
      return;
    }
    setErreur(null);
    // Painted first: a box that waits for the network before showing the new
    // words reads as a box that did not take them.
    setCommentaires((prev) => prev.map((c) => (c.id === id ? { ...c, body: corps } : c)));
    setModifie(null);
    try {
      const reponse = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, body: corps, token }),
      });
      if (!reponse.ok) throw await echec(reponse);
    } catch (e) {
      setCommentaires((prev) => prev.map((c) => (c.id === id ? avant : c)));
      setErreur(`The change did not go through: ${e instanceof Error ? e.message : "no answer"}`);
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
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid oklch(0.34 0.034 250)",
    background: "oklch(0.16 0.03 250)",
    color: "oklch(0.9 0.017 250)",
    fontSize: 13.5,
    lineHeight: 1.5,
    fontFamily: "inherit",
    outline: "none",
    resize: "vertical" as const,
  };

  const boite = {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid oklch(0.3 0.034 250)",
    background: "oklch(0.17 0.03 250 / 0.6)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  };

  const bouton = (principal: boolean) => ({
    padding: "7px 14px",
    borderRadius: 8,
    border: principal ? "none" : "1px solid oklch(0.34 0.034 250)",
    background: principal ? accentColor : "transparent",
    color: principal ? "oklch(0.15 0.034 250)" : "oklch(0.7 0.03 250)",
    fontSize: 12.5,
    fontWeight: principal ? 600 : 500,
    cursor: "pointer",
  });

  return (
    <div style={{ ...glassCard, marginBottom: 18 }}>
      <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
        Comments
      </div>

      {/* Boxes side by side where there is room, stacked on a phone: a remark
          is short, and a column of short remarks down a wide page is mostly
          empty page. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {commentaires.map((c) => {
          const sien = peutModifier(c);
          return modifie === c.id ? (
            <div key={c.id} style={boite}>
              <textarea
                value={brouillon}
                onChange={(e) => setBrouillon(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enregistrer(c.id);
                  }
                  if (e.key === "Escape") setModifie(null);
                }}
                autoFocus
                rows={3}
                style={champ}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => void enregistrer(c.id)} style={bouton(true)}>
                  Save
                </button>
                <button type="button" onClick={() => setModifie(null)} style={bouton(false)}>
                  Cancel
                </button>
                {proprietaire && (
                  <button
                    type="button"
                    onClick={() => void supprimer(c.id)}
                    style={{ ...bouton(false), marginLeft: "auto", color: "oklch(0.7 0.25 18)" }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              key={c.id}
              onClick={() => {
                if (!sien) return;
                setBrouillon(c.body);
                setModifie(c.id);
              }}
              title={sien ? "Click to edit" : undefined}
              style={{ ...boite, cursor: sien ? "text" : "default" }}
            >
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "oklch(0.88 0.017 250)", whiteSpace: "pre-wrap" }}>
                {c.body}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 11, color: c.source === "owner" ? accentColor : "oklch(0.7 0.03 250)" }}>
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
                {sien && (
                  <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginLeft: "auto" }}>edit</span>
                )}
              </div>
            </div>
          );
        })}

        {/* The empty box is the invitation: nothing to read is not a reason to
            explain that there is nothing to read. */}
        {ouvert ? (
          <div style={boite}>
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void envoyer();
                }
                if (e.key === "Escape") setOuvert(false);
              }}
              autoFocus
              rows={3}
              placeholder="What about this trade?"
              style={champ}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void envoyer()}
                disabled={envoi || !texte.trim()}
                style={{ ...bouton(true), opacity: envoi || !texte.trim() ? 0.5 : 1, cursor: envoi || !texte.trim() ? "default" : "pointer" }}
              >
                {envoi ? "…" : "Comment"}
              </button>
              <button type="button" onClick={() => setOuvert(false)} style={bouton(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            style={{
              ...boite,
              minHeight: 86,
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed oklch(0.34 0.034 250)",
              background: "transparent",
              color: "oklch(0.62 0.034 250)",
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            + Add a comment
          </button>
        )}
      </div>

      {erreur && <div style={{ fontSize: 12, color: "oklch(0.7 0.25 18)", marginTop: 12 }}>{erreur}</div>}
    </div>
  );
}
