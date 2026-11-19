import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import TerminalSidebar, { type SidebarStatus } from "@/components/TerminalSidebar";
import { AgentProvider } from "@/components/agent/AgentProvider";
import { SESSION_COOKIE, authConfig, verifySessionToken } from "@/lib/auth";
import { estProprietaire, monJournal } from "@/lib/session";
import { getEconomicEvents } from "@/lib/economicCalendar";
import { prisma } from "@/lib/prisma";
import { newsCurrencies } from "@/lib/contracts";
import { loadPairPlans } from "@/lib/planData";
import { dayKey, isNightBerlin } from "@/lib/tradingPlan";
import { sessionDate } from "@/lib/databento/clock";
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
  // On the iPhone's home screen, as an app: the only way it gets notifications.
  appleWebApp: { capable: true, title: "Journal", statusBarStyle: "black" },
  icons: { apple: "/apple-touch-icon.png" },
};

/**
 * What the menu shows of the day: the next release that blocks orders on one
 * of the plan's pairs, and the account's orders. Read through the calendar's
 * hourly cache, so it costs one request an hour, not one per page.
 */
async function sidebarStatus(): Promise<SidebarStatus | null> {
  try {
    const ownerId = await monJournal();
    const now = Date.now();
    const day = dayKey(sessionDate(now));
    const [pairs, calendar, orders] = await Promise.all([
      loadPairPlans(ownerId),
      getEconomicEvents(),
      prisma.planOrder.findMany({ where: { OR: [{ day }, { status: "filled" }] } }),
    ]);
    const followed = new Set(pairs.flatMap((p) => newsCurrencies(p.symbol)));
    const next = calendar.events
      .filter((e) => e.kind === "release" && e.impact === "high" && e.at && followed.has(e.currency))
      .map((e) => ({ at: e.at!, title: e.title, currency: e.currency, t: new Date(e.at!).getTime() }))
      .filter((e) => e.t > now - 10 * 60000 && e.t < now + 24 * 3600000 && !isNightBerlin(e.t))
      .sort((a, b) => a.t - b.t)[0];
    const live = orders.filter((o) => o.status === "filled");
    const lots = (s: string) => pairs.find((p) => p.symbol === s)?.lots ?? 2;
    return {
      nextNews: next ? { at: next.at, title: next.title, currency: next.currency } : null,
      activeOrders: orders.filter((o) => o.status === "pending" || o.status === "filled").length,
      dayPnl: orders.filter((o) => o.status === "closed" && o.day === day).reduce((a, o) => a + (o.pnl ?? 0), 0),
      positions: live.length,
      contracts: live.reduce((a, o) => a + lots(o.symbol), 0),
      hours: pairs.length ? [Math.min(...pairs.map((p) => p.hours[0])), Math.max(...pairs.map((p) => p.hours[1]))] : [2, 14],
    };
  } catch {
    // A calendar or a database that will not answer is not a reason for a page not to load.
    return null;
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
          {/* No sidebar for someone holding a share link: they are not signed
              in, there is nowhere for them to navigate, and the list of notes
              is not theirs to see the shape of. */}
          {(await connecte()) && (
            <TerminalSidebar owner={await estProprietaire()} status={(await estProprietaire()) ? await sidebarStatus() : null} />
          )}
          <div className="app-main">
            {children}
          </div>
          {modal}
          {/* The chat button is off for now (2026-11-16): put <AgentLauncher /> back here, for the owner, to bring it back. */}
        </AgentProvider>
      </body>
    </html>
  );
}
