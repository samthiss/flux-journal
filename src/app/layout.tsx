import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { AgentProvider } from "@/components/agent/AgentProvider";
import AgentLauncher from "@/components/agent/AgentLauncher";
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
  if (!(await connecte())) return [];
  return getNoteTree();
}

/** Whether this request carries a valid session. */
async function connecte() {
  const config = authConfig();
  if ("error" in config) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, config.secret);
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
        {/* The conversation is held above both the panel and the agent's page,
            so a question asked from the checklist is still there on the notes.
            The launcher only exists for someone signed in: the login screen
            inherits this layout, and an assistant offered before the password
            is an assistant offered to a stranger. */}
        <AgentProvider>
          <Sidebar initialTree={await sidebarTree()} />
          <div className="app-main">{children}</div>
          {modal}
          {await connecte() && <AgentLauncher />}
        </AgentProvider>
      </body>
    </html>
  );
}
