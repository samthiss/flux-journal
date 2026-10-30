import { cookies } from "next/headers";
import { SESSION_COOKIE, authConfig, sessionIdentity, type Identity, type Role } from "@/lib/auth";

/**
 * Who is holding the cookie on this request.
 *
 * The proxy already decides what a role may open; this is for the pages and
 * the actions, which have the other half of the job: reading and writing one
 * journal rather than the whole table, and not offering a guest buttons that
 * would be refused anyway.
 */
export async function identite(): Promise<Identity | null> {
  const config = authConfig();
  if ("error" in config) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionIdentity(token, config.secret);
}

export async function roleActuel(): Promise<Role | null> {
  return (await identite())?.role ?? null;
}

/** Whether this request is the owner's. */
export async function estProprietaire() {
  return (await roleActuel()) === "owner";
}

/**
 * Whose journal this request is in.
 *
 * Every row that belongs to somebody is written and read through this, so a
 * page that forgets it reads nothing rather than reading everyone's: the
 * failure is an empty screen for the person asking, not someone else's trades
 * on it.
 *
 * It throws where there is nobody, which only happens if a page runs that the
 * proxy should have turned away first.
 */
export async function monJournal(): Promise<string> {
  const qui = await identite();
  if (!qui) throw new Error("No session: this page should not have opened.");
  return qui.ownerId;
}

/**
 * Refuses anything but the owner, from inside the action itself.
 *
 * The door covers the pages; this covers the writes. Everything that writes
 * here is a server action, an action is a POST to whichever page it was
 * imported into, and the sidebar is imported into every page — so the notes
 * and the checklist are reachable from the three pages an account may open.
 * Scoping is the boundary for the rows an account owns; for the rows it has
 * no business in at all, this is.
 */
export async function exigeProprietaire() {
  if (!(await estProprietaire())) throw new Error("The owner of the journal only.");
}
