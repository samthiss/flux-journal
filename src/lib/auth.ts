import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// One person, one password. There are no accounts to model, so a session is
// nothing but a signed statement that says "whoever holds this cookie typed the
// password before <date>". That fits in the cookie itself: no table, no store,
// no cleanup.
//
// Proxy runs on the Node.js runtime as of Next 16, so node:crypto is available
// there — the reason this needs no JWT library.

export const SESSION_COOKIE = "flux_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Reads the two secrets, or explains what is missing.
 *
 * Missing configuration locks the app rather than opening it. Getting this the
 * other way round would mean a deploy that quietly serves the whole journal to
 * anyone, which is precisely what this file exists to prevent.
 */
export function authConfig(): { password: string; secret: string } | { error: string } {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  const missing = [!password && "APP_PASSWORD", !secret && "SESSION_SECRET"].filter(Boolean);
  if (missing.length) return { error: `Variables manquantes : ${missing.join(", ")}.` };
  return { password: password!, secret: secret! };
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Compares without leaking, through length differences included. */
function equals(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on unequal lengths, which would itself be a signal;
  // hashing first makes both sides the same size whatever was typed.
  const ah = createHmac("sha256", "compare").update(ab).digest();
  const bh = createHmac("sha256", "compare").update(bb).digest();
  return timingSafeEqual(ah, bh);
}

export function checkPassword(typed: string, expected: string) {
  return equals(typed, expected);
}

/**
 * Who is holding the cookie.
 *
 * "owner" is whoever typed the one password this journal was built around;
 * "invite" is an account it has been shared with, which may read the dashboard
 * and the trades and write nothing.
 */
export type Role = "owner" | "invite";

/**
 * A token is `<expiry>.<role>.<signature over both>`.
 *
 * Tokens issued before roles existed are `<expiry>.<signature>` and are read as
 * the owner's — the only person who had one. Dropping them would have signed
 * the owner out of their own journal to add a feature for someone else.
 */
export function createSessionToken(secret: string, role: Role = "owner") {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${role}.${sign(`${expiresAt}|${role}`, secret)}`;
}

/** The role this token carries, or null if it carries none worth trusting. */
export function sessionRole(token: string | undefined, secret: string): Role | null {
  if (!token) return null;
  const parts = token.split(".");

  if (parts.length === 2) {
    const [expiresAt, signature] = parts;
    if (!expiresAt || !signature) return null;
    if (!equals(signature, sign(expiresAt, secret))) return null;
    return Number(expiresAt) > Date.now() ? "owner" : null;
  }

  const [expiresAt, role, signature] = parts;
  if (!expiresAt || !signature || (role !== "owner" && role !== "invite")) return null;
  if (!equals(signature, sign(`${expiresAt}|${role}`, secret))) return null;
  return Number(expiresAt) > Date.now() ? role : null;
}

export function verifySessionToken(token: string | undefined, secret: string) {
  return sessionRole(token, secret) !== null;
}

/**
 * A password at rest, salted and slow.
 *
 * scrypt from the standard library rather than a dependency: this is the only
 * place the journal stores a password of anyone's but the owner's, and the one
 * thing that must not be reversible if the database is ever read by someone
 * who should not have it.
 */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function checkHashedPassword(password: string, stored: string) {
  const [algo, salt, cle] = stored.split("$");
  if (algo !== "scrypt" || !salt || !cle) return false;
  return equals(scryptSync(password, salt, 64).toString("hex"), cle);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

/** Handy for generating a SESSION_SECRET: `node -e "..."`. */
export function newSecret() {
  return randomBytes(32).toString("hex");
}
