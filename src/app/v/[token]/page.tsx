import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TRADE_FOR_STATS_SELECT } from "@/lib/stats";
import { parseTagArray } from "@/lib/tags";
import TradesClient from "@/components/TradesClient";

export const dynamic = "force-dynamic";

/**
 * Not for search engines.
 *
 * The address is the whole of the permission, so a link that found its way
 * into an index would be a journal published rather than shown to someone.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The trades, to whoever holds the link.
 *
 * No account, no session, nothing to remember: for showing the record to
 * someone who will look once. It is one page — the trades and what each was
 * annotated with — and nothing on it writes.
 */
export default async function VuePartagee({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const lien = await prisma.shareLink.findUnique({ where: { token } });
  // A withdrawn link is a link that does not exist: the two answer the same.
  if (!lien || lien.revokedAt) notFound();

  const [trades] = await Promise.all([
    prisma.trade.findMany({
      orderBy: { date: "asc" },
      select: {
        ...TRADE_FOR_STATS_SELECT,
        confirmationsBox: true,
        confirmationsReverse: true,
        invalidReasons: true,
        emotion: true,
        planFollowed: true,
      },
    }),
    // Recorded so a link nobody opens can be told from one that is being read.
    prisma.shareLink.update({ where: { token }, data: { seenAt: new Date() } }),
  ]);

  const details = Object.fromEntries(
    trades.map((t) => [
      t.id,
      {
        emotion: t.emotion ? [t.emotion] : [],
        type: parseTagArray(t.tradeTypes),
        zone: t.zone ? [t.zone] : [],
        cc: parseTagArray(t.confirmations),
        box: parseTagArray(t.confirmationsBox),
        reverse: parseTagArray(t.confirmationsReverse),
        risk: parseTagArray(t.invalidReasons),
        plan: t.planFollowed === null ? [] : [t.planFollowed ? "Yes" : "No"],
      },
    ])
  );

  return (
    <div style={{ padding: "40px 48px" }}>
      <TradesClient trades={trades} initialPeriod="all" details={details} proprietaire={false} lectureSeule />
    </div>
  );
}
