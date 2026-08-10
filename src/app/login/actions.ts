"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authConfig, checkPassword, createSessionToken, sessionCookieOptions } from "@/lib/auth";

// A single password means brute force is the only attack worth naming. There is
// no counter here on purpose: a per-process one resets on every deploy and does
// not survive more than one instance, so it would read as a protection without
// being one. What the delay below does buy is a hard ceiling on attempts per
// second down one connection, which for a password of any length is enough.
const WRONG_PASSWORD_DELAY_MS = 700;

export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  const config = authConfig();
  if ("error" in config) return `Authentification non configurée. ${config.error}`;

  const typed = String(formData.get("password") ?? "");
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
