import { cookies } from "next/headers";
import { SESSION_COOKIE, authConfig, sessionRole, type Role } from "@/lib/auth";

/**
 * Who is holding the cookie on this request.
 *
 * The proxy already decides what a role may open; this is for the pages, which
 * have the other half of the job: not offering a guest buttons that would be
 * refused at the door.
 */
export async function roleActuel(): Promise<Role | null> {
  const config = authConfig();
  if ("error" in config) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionRole(token, config.secret);
}

/** Whether this request is the owner's. */
export async function estProprietaire() {
  return (await roleActuel()) === "owner";
}
