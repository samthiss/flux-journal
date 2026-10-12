import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, authConfig, sessionRole } from "@/lib/auth";

/**
 * What an account the journal is shared with may open.
 *
 * The dashboard and the trades, and the chart images those two draw. Not the
 * notes, the checklist, the risk page or the agent — a journal shared is a
 * record shown, not a desk handed over.
 */
const POUR_INVITE = [/^\/$/, /^\/trades(\/|$)/, /^\/api\/uploads\//];

// Named Proxy rather than Middleware: Next 16 renamed the file and the export,
// and it now runs on the Node.js runtime by default.
//
// Everything is behind the password, uploaded images included — they are chart
// screenshots of real positions, and serving them to anyone with the URL would
// leave the journal open through its own back door.

export function proxy(request: NextRequest) {
  const config = authConfig();
  const { pathname } = request.nextUrl;

  if ("error" in config) {
    // Unconfigured means closed. An app that fell open here would serve the
    // whole journal to anyone, and nothing would look wrong from the outside.
    return new NextResponse(
      `Authentification non configurée. ${config.error}`,
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const role = sessionRole(request.cookies.get(SESSION_COOKIE)?.value, config.secret);
  const signedIn = role !== null;

  if (pathname === "/login" || pathname === "/inscription") {
    if (signedIn) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (role === "owner") return NextResponse.next();

  if (role === "invite") {
    /**
     * A guest reads. Everything that writes in this app is a server action,
     * and every server action is a POST to the page it was called from — so
     * one rule at the door covers them all, including the ones whose buttons
     * are hidden anyway. Hiding a button is tidiness; this is the boundary.
     */
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse("Lecture seule.", { status: 403 });
    }
    if (POUR_INVITE.some((motif) => motif.test(pathname))) return NextResponse.next();
    // Not an error: a page they cannot open is simply not theirs to open, and
    // the dashboard is where they came to look.
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Sending a browser to /login for a page is helpful; doing it for a fetch
  // would hand back a login page where JSON was expected, which reads as a
  // corrupt response rather than an expired session.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  }

  const target = new URL("/login", request.url);
  if (pathname !== "/") target.searchParams.set("from", pathname);
  return NextResponse.redirect(target);
}

export const config = {
  // Everything except Next's own build output and the favicon. Uploaded images
  // are deliberately not excluded.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
