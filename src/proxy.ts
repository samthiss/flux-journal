import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, authConfig, verifySessionToken } from "@/lib/auth";

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

  const signedIn = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config.secret);

  if (pathname === "/login") {
    if (signedIn) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (signedIn) return NextResponse.next();

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
