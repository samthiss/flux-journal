import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { AgentProvider } from "@/components/agent/AgentProvider";
import AgentLauncher from "@/components/agent/AgentLauncher";
import { SESSION_COOKIE, authConfig, verifySessionToken } from "@/lib/auth";
import { getNoteTree } from "@/lib/actions/notes";
import NewsTicker from "@/components/NewsTicker";
import { applyRatings, getEconomicEvents, type EconomicEvent } from "@/lib/economicCalendar";
import { getEventRatings } from "@/lib/actions/eventRatings";
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

/**
 * The releases around today, for the band at the top of every page.
 *
 * A three-day window rather than a day: the server is in UTC and the reader is
 * not, so which day is "today" is decided in the browser. Read through the
 * calendar's own hourly cache, so putting this on every page costs one request
 * an hour rather than one per page.
 */
async function actualitesDuJour(): Promise<{ events: EconomicEvent[]; notees: string[] }> {
  if (!(await connecte())) return { events: [], notees: [] };
  try {
    // Rated as the calendar rates them — a star clicked there is the reader's
    // own opinion of a release, and the band that announces it should hold the
    // same one.
    const [calendrier, notes] = await Promise.all([getEconomicEvents(), getEventRatings()]);
    const events = applyRatings(calendrier.events, notes);
    // Which releases the reader has judged themselves, so the band can tell a
    // star they clicked from one the source gave.
    const notees = Object.keys(notes);
    const minuit = new Date();
    minuit.setHours(0, 0, 0, 0);
    const debut = minuit.getTime() - 86400000;
    const fin = minuit.getTime() + 2 * 86400000;
    // The days the window covers, for the entries that have no clock at all —
    // a closed session, a summit. They are filed under a day, so they are kept
    // by day; dropping them left the band without the two things it is most
    // worth carrying.
    const jours = new Set(
      [-1, 0, 1, 2].map((n) => new Date(minuit.getTime() + n * 86400000).toLocaleDateString("en-CA"))
    );
    const fenetre = events.filter((e) => {
      if (!e.at) return jours.has(e.date);
      const t = new Date(e.at).getTime();
      return t >= debut && t < fin;
    });
    return { events: fenetre, notees };
  } catch {
    // A calendar that will not answer is not a reason for a page not to load.
    return { events: [], notees: [] };
  }
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
          <div className="app-main">
            <NewsTicker {...await actualitesDuJour()} />
            {children}
          </div>
          {modal}
          {await connecte() && <AgentLauncher />}
        </AgentProvider>
      </body>
    </html>
  );
}
