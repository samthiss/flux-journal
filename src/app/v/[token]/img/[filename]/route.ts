import { prisma } from "@/lib/prisma";
import { GET as servirImage } from "@/app/api/uploads/[filename]/route";

/**
 * A chart, served to whoever holds a share link.
 *
 * The images live behind `/api/uploads`, which is closed to anyone without a
 * session — and opening that to the world would hand out every capture in the
 * journal to anyone who ever saw one address. So a link's own route asks
 * whether the token is still good, and then serves the same file the journal
 * serves itself.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; filename: string }> }) {
  const { token, filename } = await ctx.params;

  const lien = await prisma.shareLink.findUnique({ where: { token } });
  if (!lien || lien.revokedAt) return new Response("Not found", { status: 404 });

  return servirImage(req, { params: Promise.resolve({ filename }) });
}
