"use client";

import { useState, useTransition } from "react";
import { PageTitle } from "@/components/NeonText";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { creerInvitation, revoquerCompte, supprimerInvitation } from "@/lib/actions/partage";

type Compte = { id: string; email: string; createdAt: string; revoque: boolean };
type Invitation = { code: string; label: string | null; createdAt: string };

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/**
 * Sharing the journal: an invitation to hand out, and the accounts it made.
 *
 * What an account can do is said on the page rather than left to be guessed —
 * it is the whole of what is being given away, and it is less than most people
 * assume when they are handed a link to someone's trading journal.
 */
export default function PartageClient({ comptes, invitations }: { comptes: Compte[]; invitations: Invitation[] }) {
  const [, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [copie, setCopie] = useState<string | null>(null);

  const lien = (code: string) =>
    typeof window === "undefined" ? `/inscription?code=${code}` : `${window.location.origin}/inscription?code=${code}`;

  const copier = async (code: string) => {
    try {
      await navigator.clipboard.writeText(lien(code));
      setCopie(code);
      window.setTimeout(() => setCopie((c) => (c === code ? null : c)), 2000);
    } catch {
      // A browser that refuses the clipboard still shows the link below.
    }
  };

  const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Partage</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Un compte partagé lit le tableau de bord et les trades — rien d&apos;autre, et rien en écriture
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={glassCard}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Inviter
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pour qui ? (facultatif)"
              style={{
                flex: 1,
                minWidth: 200,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid oklch(0.34 0.034 250)",
                background: "oklch(0.16 0.0306 250)",
                color: "oklch(0.92 0 0)",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={() =>
                startTransition(async () => {
                  const code = await creerInvitation(label);
                  setLabel("");
                  await copier(code);
                })
              }
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                border: "none",
                background: accentColor,
                color: "oklch(0.15 0.034 250)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Créer un lien
            </button>
          </div>

          {invitations.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {invitations.map((invitation) => (
                <div
                  key={invitation.code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid oklch(0.3 0.034 250)",
                    background: "oklch(0.17 0.03 250 / 0.6)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{invitation.label || "Invitation"}</div>
                    <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.55 0.02 250)", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {lien(invitation.code)}
                    </div>
                  </div>
                  <span
                    onClick={() => void copier(invitation.code)}
                    style={{ ...mono, fontSize: 11, padding: "4px 10px", borderRadius: 999, border: `1px solid ${accentColor}`, color: accentColor, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {copie === invitation.code ? "copié" : "copier"}
                  </span>
                  <span
                    onClick={() => startTransition(async () => void (await supprimerInvitation(invitation.code)))}
                    title="Annuler cette invitation"
                    style={{ fontSize: 12, color: "oklch(0.55 0.03 250)", cursor: "pointer" }}
                  >
                    ✕
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={glassCard}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Comptes partagés
          </div>
          {comptes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
              Personne pour l&apos;instant. Un lien d&apos;invitation ouvre un compte, et un compte ouvre deux pages.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comptes.map((compte) => (
                <div
                  key={compte.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid oklch(0.3 0.034 250)",
                    background: "oklch(0.17 0.03 250 / 0.6)",
                    borderRadius: 8,
                    opacity: compte.revoque ? 0.55 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{compte.email}</div>
                    <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.55 0.02 250)" }}>
                      depuis le {jour(compte.createdAt)}
                      {compte.revoque ? " · accès retiré" : ""}
                    </div>
                  </div>
                  <span
                    onClick={() => startTransition(async () => void (await revoquerCompte(compte.id, !compte.revoque)))}
                    style={{
                      ...mono,
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 999,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      border: `1px solid ${compte.revoque ? accentColor : lossColor}`,
                      color: compte.revoque ? accentColor : lossColor,
                    }}
                  >
                    {compte.revoque ? "rendre l'accès" : "retirer l'accès"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
