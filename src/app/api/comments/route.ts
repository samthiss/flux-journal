import { prisma } from "@/lib/prisma";
import { roleActuel } from "@/lib/session";

/**
 * What the readers say about a trade: one text per trade, written here.
 *
 * A route rather than a server action, and the only way in: every write in
 * this journal is an action, and actions are POSTs the door turns away for
 * anyone but the owner. Opening that door for comments would open it for
 * every other action in the same bundle — deleting a trade included. So this
 * is its own address, and it does one thing.
 *
 * Who may write: the owner, an account the journal was shared with, or
 * whoever holds a share link, which they prove by sending its token. Nobody
 * signs in and nobody is asked for a name, so there is nothing finer to check
 * a writer against; a link that can write can also rewrite, which is the
 * trust it already carried.
 */
export async function POST(req: Request) {
  let corps: { tradeId?: unknown; body?: unknown; token?: unknown };
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  const tradeId = typeof corps.tradeId === "string" ? corps.tradeId : "";
  const texte = typeof corps.body === "string" ? corps.body.trim().slice(0, 4000) : "";
  const token = typeof corps.token === "string" ? corps.token : "";

  if (!tradeId) return Response.json({ error: "Which trade?" }, { status: 400 });

  const role = await roleActuel();
  let source: string | null = role === "owner" ? "owner" : role === "invite" ? "account" : null;

  if (!source && token) {
    const lien = await prisma.shareLink.findUnique({ where: { token } });
    if (lien && !lien.revokedAt) source = "link";
  }
  if (!source) return Response.json({ error: "Not allowed." }, { status: 403 });

  // A comment on a trade that does not exist is a comment on nothing, and the
  // id came from the page rather than from the database.
  const trade = await prisma.trade.findUnique({ where: { id: tradeId }, select: { id: true } });
  if (!trade) return Response.json({ error: "Not found." }, { status: 404 });

  // Emptied means withdrawn: one text per trade, and a blank one is no text.
  if (!texte) {
    await prisma.tradeComment.deleteMany({ where: { tradeId } });
    return Response.json({ body: "" });
  }

  /**
   * One row per trade, rewritten in place.
   *
   * The table can hold more than one — it was built for a thread — and the
   * oldest row is the one kept so that the identity of the comment does not
   * move under a reader who is editing it. Any extras from before are swept
   * up here rather than left to accumulate.
   */
  const existants = await prisma.tradeComment.findMany({
    where: { tradeId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existants.length === 0) {
    await prisma.tradeComment.create({ data: { tradeId, body: texte, author: "", source } });
  } else {
    await prisma.tradeComment.update({ where: { id: existants[0].id }, data: { body: texte, source } });
    if (existants.length > 1) {
      await prisma.tradeComment.deleteMany({ where: { id: { in: existants.slice(1).map((c) => c.id) } } });
    }
  }

  return Response.json({ body: texte });
}

/** Clearing it: the owner's alone, on their own page. */
export async function DELETE(req: Request) {
  if ((await roleActuel()) !== "owner") return Response.json({ error: "Not allowed." }, { status: 403 });
  const tradeId = new URL(req.url).searchParams.get("tradeId") ?? "";
  if (!tradeId) return Response.json({ error: "Which trade?" }, { status: 400 });
  await prisma.tradeComment.deleteMany({ where: { tradeId } });
  return Response.json({ ok: true });
}
