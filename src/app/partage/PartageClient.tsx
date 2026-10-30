"use client";

import { useState, useTransition } from "react";
import { PageTitle } from "@/components/NeonText";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import {
  creerInvitation,
  fermerLesAutresLiens,
  lienDeVue,
  revoquerCompte,
  revoquerLienDeVue,
  supprimerInvitation,
} from "@/lib/actions/partage";

type Compte = { id: string; email: string; createdAt: string; revoque: boolean };
type Invitation = { code: string; label: string | null; createdAt: string };
type Lien = { token: string; label: string | null; createdAt: string; seenAt: string | null };

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/**
 * The two ways to hand this journal out, which are not the same thing.
 *
 * An invitation makes somebody an account with a journal of their own — empty,
 * three pages wide, nothing of this one in it. A view link shows this journal
 * to whoever holds the address, and asks them for nothing.
 *
 * Which is which is written on the page rather than left to be guessed: the
 * two were confused before, when signing up put the reader straight into
 * somebody else's trades.
 */
export default function PartageClient({
  comptes,
  invitations,
  liens,
  proprietaire = true,
}: {
  comptes: Compte[];
  invitations: Invitation[];
  liens: Lien[];
  /**
   * Whether this journal may hand out accounts.
   *
   * The owner's alone. An account keeping a journal here shares it with a view
   * link; issuing invitations would be issuing accounts on somebody else's
   * installation, which is not what being given a journal is.
   */
  proprietaire?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [copie, setCopie] = useState<string | null>(null);

  const lien = (code: string) =>
    typeof window === "undefined" ? `/inscription?code=${code}` : `${window.location.origin}/inscription?code=${code}`;
  const adresseDeVue = (token: string) =>
    typeof window === "undefined" ? `/v/${token}` : `${window.location.origin}/v/${token}`;

  const copier = async (code: string, adresse?: string) => {
    try {
      await navigator.clipboard.writeText(adresse ?? lien(code));
      setCopie(code);
      window.setTimeout(() => setCopie((c) => (c === code ? null : c)), 2000);
    } catch {
      // A browser that refuses the clipboard still shows the link below.
    }
  };

  const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

  // The journal's link is the oldest one still open; anything after it was
  // made by the button before it learned to hand back the same address.
  const [premier, ...autres] = liens;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>Partage</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          Une invitation ouvre un journal vide, qui est le sien ; un lien de vue montre le tien
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {proprietaire && (
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
        )}

        <div style={glassCard}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Lien de vue
          </div>
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)", marginBottom: 14 }}>
            Une adresse qui montre tes trades, sans compte ni mot de passe. Une seule : le bouton
            redonne la même, il n&apos;en fabrique pas une deuxième
          </div>

          {/* One link, shown rather than listed. The button used to mint a row
              on every press, which left a page of identical addresses and
              nothing to say which had been sent to whom. */}
          {premier ? (
            <div
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
                <div style={{ ...mono, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {adresseDeVue(premier.token)}
                </div>
                <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.55 0.02 250)", marginTop: 3 }}>
                  {premier.seenAt ? `ouvert le ${jour(premier.seenAt)}` : "jamais ouvert"}
                </div>
              </div>
              <span
                onClick={() => void copier(premier.token, adresseDeVue(premier.token))}
                style={{ ...mono, fontSize: 11, padding: "4px 10px", borderRadius: 999, border: `1px solid ${accentColor}`, color: accentColor, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {copie === premier.token ? "copié" : "copier"}
              </span>
              <span
                onClick={() => startTransition(async () => void (await revoquerLienDeVue(premier.token)))}
                title="Fermer ce lien — l'adresse cesse de fonctionner"
                style={{ ...mono, fontSize: 11, padding: "4px 10px", borderRadius: 999, border: `1px solid ${lossColor}`, color: lossColor, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                fermer
              </span>
            </div>
          ) : (
            <button
              onClick={() =>
                startTransition(async () => {
                  const token = await lienDeVue();
                  await copier(token, adresseDeVue(token));
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
              Créer le lien de vue
            </button>
          )}

          {/* The ones from before the button stopped multiplying. They still
              work, so they are shown rather than swept: one of them may be the
              address somebody was actually given. */}
          {autres.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "oklch(0.6 0.03 250)" }}>
                  {autres.length} autre{autres.length > 1 ? "s" : ""} adresse{autres.length > 1 ? "s" : ""} encore
                  ouverte{autres.length > 1 ? "s" : ""}, d&apos;avant — elles fonctionnent toujours
                </div>
                {/* One press rather than eleven. Kept as a deliberate button,
                    because any of these may be the address somebody was
                    handed: closing them is a decision, not housekeeping. */}
                <span
                  onClick={() => startTransition(async () => void (await fermerLesAutresLiens()))}
                  title="Ferme les anciennes adresses et garde celle du dessus"
                  style={{ ...mono, fontSize: 11, padding: "3px 10px", borderRadius: 999, border: `1px solid ${lossColor}`, color: lossColor, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  fermer les {autres.length} autres
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {autres.map((l) => (
                  <div key={l.token} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ ...mono, flex: 1, minWidth: 0, fontSize: 10.5, color: "oklch(0.55 0.02 250)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {adresseDeVue(l.token)}
                    </div>
                    <span
                      onClick={() => void copier(l.token, adresseDeVue(l.token))}
                      style={{ ...mono, fontSize: 10.5, color: accentColor, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      {copie === l.token ? "copié" : "copier"}
                    </span>
                    <span
                      onClick={() => startTransition(async () => void (await revoquerLienDeVue(l.token)))}
                      style={{ ...mono, fontSize: 10.5, color: lossColor, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      fermer
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {proprietaire && (
        <div style={glassCard}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Comptes partagés
          </div>
          {comptes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
              Personne pour l&apos;instant. Une invitation ouvre un compte, et un compte tient son propre journal — ses trades, son tableau de bord, ses liens de partage. Pas le tien : pour montrer le tien, c&apos;est un lien de vue.
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
        )}
      </div>
    </div>
  );
}
