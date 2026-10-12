"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Who the journal is shared with, and the invitations not yet spent.
 *
 * Only ever read from the owner's own page, which the proxy already keeps a
 * guest out of — and a guest's session cannot POST at all, which is what every
 * one of these actions is.
 */
export async function getPartage() {
  const [comptes, invitations] = await Promise.all([
    prisma.journalUser.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { usedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return { comptes, invitations };
}

/**
 * Makes an invitation, which is a link.
 *
 * Twenty-four bytes of randomness: it is the whole of the right to make an
 * account here, so it has to be unguessable rather than memorable.
 */
export async function creerInvitation(label: string) {
  const code = randomBytes(24).toString("base64url");
  await prisma.invitation.create({ data: { code, label: label.trim() || null } });
  revalidatePath("/partage");
  return code;
}

/** Drops an invitation nobody has used. */
export async function supprimerInvitation(code: string) {
  await prisma.invitation.deleteMany({ where: { code, usedAt: null } });
  revalidatePath("/partage");
}

/**
 * Closes an account, without deleting it.
 *
 * The row is what says the invitation was spent and by whom; removing it would
 * leave the history of who was given access with a hole in it. Revoked, the
 * password stops working at the next sign-in — and the session they are
 * holding expires on its own, which is the one gap: a cookie already issued
 * outlives the revocation until it runs out.
 */
export async function revoquerCompte(id: string, revoque: boolean) {
  await prisma.journalUser.update({
    where: { id },
    data: { revokedAt: revoque ? new Date() : null },
  });
  revalidatePath("/partage");
}
