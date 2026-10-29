"use client";

import { useState } from "react";
import { accentColor, glassCard } from "@/lib/theme";

/**
 * The readers' half of the page.
 *
 * The same card as the post-trade analysis above it, and read the same way —
 * one block of text about this trade. The difference is whose it is: that one
 * is written in the trade form by whoever keeps the journal, and this one is
 * written here, in the page, by whoever it was shown to.
 *
 * One text, not a thread. A remark about a trade is rarely right the first
 * time, and a log of corrections underneath each other is harder to read than
 * the thing it was correcting; so it is opened and said again instead. Anyone
 * holding the link can do that, which is the trust the link already carries.
 */
export default function TradeComments({
  tradeId,
  initial,
  token,
}: {
  tradeId: string;
  /** What has been said about this trade so far, if anything. */
  initial: string | null;
  /** The share link this page was opened through, when it was. */
  token?: string;
}) {
  const [texte, setTexte] = useState(initial ?? "");
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    const corps = brouillon.trim();
    if (envoi || corps === texte) {
      setOuvert(false);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    const avant = texte;
    // Painted first: a card that waits for the network before showing the new
    // words reads as a card that did not take them.
    setTexte(corps);
    setOuvert(false);
    try {
      const reponse = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, body: corps, token }),
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
    } catch (e) {
      setTexte(avant);
      setErreur(`The comment did not go through: ${e instanceof Error ? e.message : "no answer"}`);
    } finally {
      setEnvoi(false);
    }
  }

  const corpsStyle = { fontSize: 14, lineHeight: 1.6, color: "oklch(0.8 0.017 250)" } as const;

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

      {ouvert ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
            onKeyDown={(e) => {
              // Enter makes a new line here, as it does in any other piece of
              // writing; Escape leaves the text as it was.
              if (e.key === "Escape") setOuvert(false);
            }}
            autoFocus
            rows={4}
            placeholder="What about this trade?"
            style={{
              ...corpsStyle,
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 13px",
              borderRadius: 8,
              border: "1px solid oklch(0.34 0.034 250)",
              background: "oklch(0.16 0.03 250)",
              color: "oklch(0.9 0.017 250)",
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={() => void enregistrer()} disabled={envoi} style={{ ...bouton(true), opacity: envoi ? 0.5 : 1 }}>
              {envoi ? "…" : "Save"}
            </button>
            <button type="button" onClick={() => setOuvert(false)} style={bouton(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* The text itself is the way in: a card that is read by clicking is
           also written by clicking, and a button beside it would only say
           again what the cursor already says. */
        <div
          onClick={() => {
            setBrouillon(texte);
            setOuvert(true);
          }}
          title="Click to write"
          style={{ ...corpsStyle, whiteSpace: "pre-wrap", cursor: "text", color: texte ? corpsStyle.color : "oklch(0.55 0.03 250)" }}
        >
          {texte || "Nothing said about this trade yet. Click to write."}
        </div>
      )}

      {erreur && <div style={{ fontSize: 12, color: "oklch(0.7 0.25 18)", marginTop: 12 }}>{erreur}</div>}
    </div>
  );
}
