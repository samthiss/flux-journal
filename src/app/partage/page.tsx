import { getPartage } from "@/lib/actions/partage";
import PartageClient from "./PartageClient";

export const dynamic = "force-dynamic";

/**
 * Who the journal is shared with.
 *
 * The owner's page: the proxy lets nobody else near it, and a guest's session
 * cannot post anything from it either.
 */
export default async function PartagePage() {
  const { comptes, invitations } = await getPartage();
  return (
    <PartageClient
      comptes={comptes.map((c) => ({
        id: c.id,
        email: c.email,
        createdAt: c.createdAt.toISOString(),
        revoque: c.revokedAt !== null,
      }))}
      invitations={invitations.map((i) => ({ code: i.code, label: i.label, createdAt: i.createdAt.toISOString() }))}
    />
  );
}
