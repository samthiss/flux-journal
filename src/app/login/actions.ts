"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  authConfig,
  checkHashedPassword,
  checkPassword,
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/auth";

// A single password means brute force is the only attack worth naming. There is
// no counter here on purpose: a per-process one resets on every deploy and does
// not survive more than one instance, so it would read as a protection without
// being one. What the delay below does buy is a hard ceiling on attempts per
// second down one connection, which for a password of any length is enough.
const WRONG_PASSWORD_DELAY_MS = 700;

export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  const config = authConfig();
  if ("error" in config) return `Authentification non configurée. ${config.error}`;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const typed = String(formData.get("password") ?? "");

  // An address means an account the journal was shared with; none means the
  // owner, who has no account and never needed one.
  if (email) {
    const compte = await prisma.journalUser.findUnique({ where: { email } });
    if (!compte || compte.revokedAt || !checkHashedPassword(typed, compte.passwordHash)) {
      await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
      return "Adresse ou mot de passe incorrect.";
    }
    const store = await cookies();
    store.set(SESSION_COOKIE, createSessionToken(config.secret, "invite"), sessionCookieOptions);
    redirect("/");
  }

  if (!checkPassword(typed, config.password)) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return "Mot de passe incorrect.";
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(config.secret), sessionCookieOptions);

  const from = String(formData.get("from") ?? "");
  // Only ever a path of ours: an absolute URL here would turn the login form
  // into a redirector to anywhere.
  redirect(from.startsWith("/") && !from.startsWith("//") ? from : "/");
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

/**
 * Makes an account from an invitation.
 *
 * The code is the whole of the right to be here: it is spent on use, so a link
 * passed around twice makes one account. Nothing about the person is asked for
 * beyond an address to sign in with — this is a journal being shown, not a
 * service being joined.
 */
export async function signUp(_prev: string | null, formData: FormData): Promise<string | null> {
  const config = authConfig();
  if ("error" in config) return `Authentification non configurée. ${config.error}`;

  const code = String(formData.get("code") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const motDePasse = String(formData.get("password") ?? "");

  if (!email.includes("@")) return "Il faut une adresse e-mail.";
  if (motDePasse.length < 8) return "Le mot de passe fait au moins 8 caractères.";

  const invitation = await prisma.invitation.findUnique({ where: { code } });
  if (!invitation || invitation.usedAt) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return "Cette invitation n'est plus valable.";
  }
  if (await prisma.journalUser.findUnique({ where: { email } })) {
    return "Un compte existe déjà avec cette adresse.";
  }

  await prisma.$transaction([
    prisma.journalUser.create({ data: { email, passwordHash: hashPassword(motDePasse) } }),
    prisma.invitation.update({ where: { code }, data: { usedAt: new Date(), usedBy: email } }),
  ]);

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(config.secret, "invite"), sessionCookieOptions);
  redirect("/");
}
