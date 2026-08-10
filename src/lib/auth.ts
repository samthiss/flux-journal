import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

/** A token is `<expiry>.<signature over that expiry>`. */
export function createSessionToken(secret: string) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${sign(String(expiresAt), secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string) {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;
  if (!equals(signature, sign(expiresAt, secret))) return false;
  return Number(expiresAt) > Date.now();
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
