import { prisma } from "@/lib/prisma";
import { roleActuel } from "@/lib/session";

/**
 * Leaving a remark on a trade.
 *
 * A route rather than a server action, and the only way in: every write in
 * this journal is an action, and actions are POSTs the door turns away for
 * anyone but the owner. Opening that door for comments would open it for
 * every other action in the same bundle — deleting a trade included. So this
 * is its own address, and it does one thing.
 *
 * Who may write: the owner, an account the journal was shared with, or
 * whoever holds a share link, which they prove by sending its token.
 */
export async function POST(req: Request) {
  let corps: { tradeId?: unknown; body?: unknown; author?: unknown; token?: unknown };
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  const tradeId = typeof corps.tradeId === "string" ? corps.tradeId : "";
  const texte = typeof corps.body === "string" ? corps.body.trim().slice(0, 2000) : "";
  const nom = typeof corps.author === "string" ? corps.author.trim().slice(0, 60) : "";
  const token = typeof corps.token === "string" ? corps.token : "";

  if (!tradeId || !texte) return Response.json({ error: "Nothing to say." }, { status: 400 });

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

  const comment = await prisma.tradeComment.create({
    data: { tradeId, body: texte, author: nom || (source === "owner" ? "Me" : "Guest"), source },
  });

  return Response.json({
    comment: {
      id: comment.id,
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      source: comment.source,
    },
  });
}

/**
 * Rewriting one.
 *
 * Second thoughts about a trade are the normal case, so a remark can be
 * reopened and said better rather than corrected in a second remark
 * underneath the first. Who may: the owner, and whoever reads through a
 * working link.
 *
 * It cannot be narrower than that. Nobody signs in here and nobody is asked
 * for a name, so there is nothing to check a writer against — the page only
 * offers the box to the browser that wrote it. Whoever holds the link could
 * rewrite another reader's remark through this address, which is the same
 * trust the link already carries: it lets its holder write at all.
 */
export async function PATCH(req: Request) {
  let corps: { id?: unknown; body?: unknown; token?: unknown };
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  const id = typeof corps.id === "string" ? corps.id : "";
  const texte = typeof corps.body === "string" ? corps.body.trim().slice(0, 2000) : "";
  const token = typeof corps.token === "string" ? corps.token : "";
  if (!id || !texte) return Response.json({ error: "Nothing to say." }, { status: 400 });

  const role = await roleActuel();
  let permis = role === "owner" || role === "invite";
  if (!permis && token) {
    const lien = await prisma.shareLink.findUnique({ where: { token } });
    permis = Boolean(lien && !lien.revokedAt);
  }
  if (!permis) return Response.json({ error: "Not allowed." }, { status: 403 });

  const modifie = await prisma.tradeComment.updateMany({ where: { id }, data: { body: texte } });
  if (modifie.count === 0) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}

/** Removing one: the owner's alone, on their own page. */
export async function DELETE(req: Request) {
  if ((await roleActuel()) !== "owner") return Response.json({ error: "Not allowed." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "Which one?" }, { status: 400 });
  await prisma.tradeComment.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
