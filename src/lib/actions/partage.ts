"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { estProprietaire, exigeProprietaire, monJournal } from "@/lib/session";

/**
 * The ways this journal is handed out.
 *
 * View links for everyone who keeps a journal here — they are how a journal is
 * shown — and, for the owner alone, the invitations and the accounts those
 * made. Letting an account issue invitations would let it hand out accounts on
 * this installation, which is not what being given a journal is.
 */
export async function getPartage() {
  const ownerId = await monJournal();
  const proprietaire = await estProprietaire();
  const [comptes, invitations, liens] = await Promise.all([
    proprietaire
      ? prisma.journalUser.findMany({ where: { invitedBy: ownerId }, orderBy: { createdAt: "asc" } })
      : [],
    proprietaire
      ? prisma.invitation.findMany({ where: { ownerId, usedAt: null }, orderBy: { createdAt: "desc" } })
      : [],
    // Oldest first, so the one the page shows as "the" link is the one
    // lienDeVue hands back — the same address every time, in both places.
    prisma.shareLink.findMany({ where: { ownerId, revokedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  return { comptes, invitations, liens, proprietaire };
}

/**
 * The link that shows the trades, with no account behind it.
 *
 * For showing the record to someone: a sign-up asked of them would be a
 * password they keep and a row here for ever. The address is the whole of the
 * permission, so it is long, and it can be taken back.
 *
 * One per journal. Asking for it twice hands back the same address rather than
 * minting another — the button is read as "show me my link", and it used to
 * answer with a new row every time it was pressed, which left a page of
 * identical links and nothing to say which had been sent to whom.
 */
export async function lienDeVue() {
  const ownerId = await monJournal();
  const existant = await prisma.shareLink.findFirst({
    where: { ownerId, revokedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (existant) return existant.token;

  const token = randomBytes(24).toString("base64url");
  await prisma.shareLink.create({ data: { ownerId, token } });
  revalidatePath("/partage");
  return token;
}

/** Closes a link. The address stops working at the next click. */
export async function revoquerLienDeVue(token: string) {
  const ownerId = await monJournal();
  await prisma.shareLink.updateMany({
    where: { ownerId, token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/partage");
}

/**
 * Makes an invitation, which is a link.
 *
 * Twenty-four bytes of randomness: it is the whole of the right to make an
 * account here, so it has to be unguessable rather than memorable. The
 * owner's alone — an account keeping a journal here shares it with a view
 * link, and does not hand out accounts of its own.
 */
export async function creerInvitation(label: string) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  const code = randomBytes(24).toString("base64url");
  await prisma.invitation.create({ data: { ownerId, code, label: label.trim() || null } });
  revalidatePath("/partage");
  return code;
}

/** Drops an invitation nobody has used. */
export async function supprimerInvitation(code: string) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  await prisma.invitation.deleteMany({ where: { ownerId, code, usedAt: null } });
  revalidatePath("/partage");
}

/**
 * Closes an account, without deleting it.
 *
 * The row is what says the invitation was spent and by whom; removing it would
 * leave the history of who was invited with a hole in it, and would orphan the
 * journal that account has been keeping. Revoked, the password stops working
 * at the next sign-in — and the session they are holding expires on its own,
 * which is the one gap: a cookie already issued outlives the revocation until
 * it runs out.
 */
export async function revoquerCompte(id: string, revoque: boolean) {
  await exigeProprietaire();
  const ownerId = await monJournal();
  // Only an account this journal invited, and only its own sign-in: what it
  // wrote in its own journal is its own and is not touched here.
  await prisma.journalUser.updateMany({
    where: { id, invitedBy: ownerId },
    data: { revokedAt: revoque ? new Date() : null },
  });
  revalidatePath("/partage");
}
