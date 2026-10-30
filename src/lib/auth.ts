import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// A session is a signed statement: "whoever holds this cookie proved, before
// <date>, that they are <who>". It fits in the cookie itself — no table, no
// store, no cleanup — and <who> is what every query is then scoped by.
//
// There are two kinds of who. The owner typed the one password the journal was
// built around and is written as "owner", an id no account can be given. An
// account signed in with an address and is written as its own row's id, and
// what it reads and writes is its own journal, which starts empty.
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
  if (missing.length) return { error: `Missing variables: ${missing.join(", ")}.` };
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
 * "owner" is whoever typed the one password this journal was built around, and
 * the only one with the whole of it — the notes, the checklist, the plan, the
 * agent. "invite" is an account made from an invitation: it keeps a journal of
 * its own, three pages wide, and never sees anyone else's rows.
 */
export type Role = "owner" | "invite";

/** The owner's journal, under an id no account can be issued. */
export const OWNER_ID = "owner";

/** Whose journal this cookie opens, and how much of the app it opens. */
export type Identity = { role: Role; ownerId: string };

/**
 * A token is `<expiry>.<role>.<journal>.<signature over all three>`.
 *
 * Earlier tokens had no journal (`<expiry>.<role>.<sig>`) or no role at all
 * (`<expiry>.<sig>`), and both are read as the owner's — the only person who
 * held one. Dropping them would have signed the owner out of their own journal
 * to add a feature for someone else.
 */
export function createSessionToken(secret: string, role: Role = "owner", ownerId: string = OWNER_ID) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${role}.${ownerId}.${sign(`${expiresAt}|${role}|${ownerId}`, secret)}`;
}

/** Who this token says is holding it, or null if it says nothing worth trusting. */
export function sessionIdentity(token: string | undefined, secret: string): Identity | null {
  if (!token) return null;
  const parts = token.split(".");
  const vivant = (expiresAt: string) => Number(expiresAt) > Date.now();

  if (parts.length === 2) {
    const [expiresAt, signature] = parts;
    if (!expiresAt || !signature) return null;
    if (!equals(signature, sign(expiresAt, secret))) return null;
    return vivant(expiresAt) ? { role: "owner", ownerId: OWNER_ID } : null;
  }

  if (parts.length === 3) {
    const [expiresAt, role, signature] = parts;
    if (!expiresAt || !signature || (role !== "owner" && role !== "invite")) return null;
    if (!equals(signature, sign(`${expiresAt}|${role}`, secret))) return null;
    // An account's cookie from before journals were separate says nothing
    // about which one it opens, so it opens none: it signs in again.
    if (role !== "owner") return null;
    return vivant(expiresAt) ? { role: "owner", ownerId: OWNER_ID } : null;
  }

  const [expiresAt, role, ownerId, signature] = parts;
  if (!expiresAt || !ownerId || !signature || (role !== "owner" && role !== "invite")) return null;
  if (!equals(signature, sign(`${expiresAt}|${role}|${ownerId}`, secret))) return null;
  // The owner's id is not a name an account can be signed into: a token
  // claiming both at once is a token that was not issued here.
  if ((role === "owner") !== (ownerId === OWNER_ID)) return null;
  return vivant(expiresAt) ? { role, ownerId } : null;
}

/** The role alone, for the places that only ask how much of the app is open. */
export function sessionRole(token: string | undefined, secret: string): Role | null {
  return sessionIdentity(token, secret)?.role ?? null;
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
