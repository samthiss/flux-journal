import { prisma } from "@/lib/prisma";
import { identite } from "@/lib/session";

/**
 * What the readers say about a trade: one text per trade, written here.
 *
 * A route rather than a server action, and the only way in for a reader: a
 * share link holds no session at all, and the door refuses it every POST.
 * Opening that door for a page would open it for every action in the page's
 * bundle — deleting a trade included. So this is its own address, and it does
 * one thing.
 *
 * Who may write: whoever keeps the journal the trade is in, or whoever holds
 * one of that journal's share links, which they prove by sending its token. A
 * session or a link for another journal is no permission here — the trade is
 * looked up inside the journal the writer turns out to belong to, so an id
 * from somewhere else is simply not found.
 *
 * Nobody is asked for a name, so there is nothing finer to check a writer
 * against; a link that can write can also rewrite, which is the trust it
 * already carried.
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

  const qui = await identite();
  let source: string | null = qui ? "owner" : null;
  let journal = qui?.ownerId ?? null;

  if (!journal && token) {
    const lien = await prisma.shareLink.findUnique({ where: { token } });
    if (lien && !lien.revokedAt) {
      source = "link";
      journal = lien.ownerId;
    }
  }
  if (!journal || !source) return Response.json({ error: "Not allowed." }, { status: 403 });

  // A comment on a trade that does not exist is a comment on nothing, and the
  // id came from the page rather than from the database — so it is looked for
  // in the one journal this writer has anything to do with.
  const trade = await prisma.trade.findFirst({ where: { id: tradeId, ownerId: journal }, select: { id: true } });
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

/** Clearing it: for whoever keeps the journal the trade is in. */
export async function DELETE(req: Request) {
  const qui = await identite();
  if (!qui) return Response.json({ error: "Not allowed." }, { status: 403 });
  const tradeId = new URL(req.url).searchParams.get("tradeId") ?? "";
  if (!tradeId) return Response.json({ error: "Which trade?" }, { status: 400 });
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, ownerId: qui.ownerId },
    select: { id: true },
  });
  if (!trade) return Response.json({ error: "Not found." }, { status: 404 });
  await prisma.tradeComment.deleteMany({ where: { tradeId } });
  return Response.json({ ok: true });
}
