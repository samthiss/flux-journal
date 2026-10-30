import { getPartage } from "@/lib/actions/partage";
import PartageClient from "./PartageClient";

export const dynamic = "force-dynamic";

/**
 * How this journal is handed out.
 *
 * Everyone who keeps a journal here opens it, and sees their own links. The
 * invitations are the owner's half of the page and are not drawn for anyone
 * else — nor would the actions behind them answer.
 */
export default async function PartagePage() {
  const { comptes, invitations, liens, proprietaire } = await getPartage();
  return (
    <PartageClient
      proprietaire={proprietaire}
      comptes={comptes.map((c) => ({
        id: c.id,
        email: c.email,
        createdAt: c.createdAt.toISOString(),
        revoque: c.revokedAt !== null,
      }))}
      invitations={invitations.map((i) => ({ code: i.code, label: i.label, createdAt: i.createdAt.toISOString() }))}
      liens={liens.map((l) => ({
        token: l.token,
        label: l.label,
        createdAt: l.createdAt.toISOString(),
        seenAt: l.seenAt?.toISOString() ?? null,
      }))}
    />
  );
}
