"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { monJournal } from "@/lib/session";

/**
 * Who this journal is shared with, and the invitations not yet spent.
 *
 * Each journal keeps its own: the accounts it invited, the codes it issued and
 * the links it opened. An account sharing its own journal sees its own three
 * lists and nobody else's.
 */
export async function getPartage() {
  const ownerId = await monJournal();
  const [comptes, invitations, liens] = await Promise.all([
    prisma.journalUser.findMany({ where: { invitedBy: ownerId }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { ownerId, usedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.shareLink.findMany({ where: { ownerId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return { comptes, invitations, liens };
}

/**
 * Makes a link that shows the trades, with no account behind it.
 *
 * For showing the record to someone who will look once: a sign-up asked of
 * them would be a password they keep and a row here for ever. The address is
 * the whole of the permission, so it is long, and it can be taken back.
 */
export async function creerLienDeVue(label: string) {
  const ownerId = await monJournal();
  const token = randomBytes(24).toString("base64url");
  await prisma.shareLink.create({ data: { ownerId, token, label: label.trim() || null } });
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
 * account here, so it has to be unguessable rather than memorable.
 */
export async function creerInvitation(label: string) {
  const ownerId = await monJournal();
  const code = randomBytes(24).toString("base64url");
  await prisma.invitation.create({ data: { ownerId, code, label: label.trim() || null } });
  revalidatePath("/partage");
  return code;
}

/** Drops an invitation nobody has used. */
export async function supprimerInvitation(code: string) {
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
  const ownerId = await monJournal();
  // Only an account this journal invited, and only its own sign-in: what it
  // wrote in its own journal is its own and is not touched here.
  await prisma.journalUser.updateMany({
    where: { id, invitedBy: ownerId },
    data: { revokedAt: revoque ? new Date() : null },
  });
  revalidatePath("/partage");
}
