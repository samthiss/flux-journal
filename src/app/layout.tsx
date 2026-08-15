import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { SESSION_COOKIE, authConfig, verifySessionToken } from "@/lib/auth";
import { getNoteTree } from "@/lib/actions/notes";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Flux Journal",
  description: "Personal day trading journal",
};

/**
 * The note tree the sidebar draws, or an empty tree for a visitor who has not
 * signed in.
 *
 * The login page inherits this layout, and it is the one route the proxy lets
 * through without a session. Querying the journal there would put a database
 * read — and the seeding check that comes with it — behind every load of a
 * screen whose whole point is that nothing has been unlocked yet.
 */
async function sidebarTree() {
  const config = authConfig();
  if ("error" in config) return [];
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token, config.secret)) return [];
  return getNoteTree();
}

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="app-shell">
        <Sidebar initialTree={await sidebarTree()} />
        <div className="app-main">{children}</div>
        {modal}
      </body>
    </html>
  );
}
