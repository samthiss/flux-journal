import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TradeDetail from "@/components/TradeDetail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One trade, to whoever holds the link.
 *
 * The same page the owner reads, minus everything that writes — the edit and
 * delete buttons are the owner's alone already — and with its captures read
 * through the link's own address rather than the journal's.
 */
export default async function TradePartage({ params }: { params: Promise<{ token: string; trade: string }> }) {
  const { token, trade } = await params;

  const lien = await prisma.shareLink.findUnique({ where: { token } });
  if (!lien || lien.revokedAt) notFound();

  return (
    <div style={{ padding: "40px 48px" }}>
      <TradeDetail
        id={trade}
        retour={`/v/${token}`}
        images={(url) =>
          url.startsWith("/api/uploads/") ? `/v/${token}/img/${url.slice("/api/uploads/".length)}` : url
        }
      />
    </div>
  );
}
