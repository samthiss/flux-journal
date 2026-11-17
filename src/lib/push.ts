import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * The journal's push keys, made the first time they are asked for.
 *
 * Kept in the database rather than in the environment: there is nothing to
 * set up on Railway, and they outlive every deploy — which they must, since a
 * phone's subscription only accepts messages signed with the key it was given.
 */
export async function pushKeys() {
  const row = await prisma.pushKeys.findUnique({ where: { id: 1 } });
  if (row) return row;
  const k = webpush.generateVAPIDKeys();
  // Two first requests at once: the second keeps the first's keys.
  await prisma.pushKeys.upsert({ where: { id: 1 }, create: { id: 1, publicKey: k.publicKey, privateKey: k.privateKey }, update: {} });
  return (await prisma.pushKeys.findUnique({ where: { id: 1 } }))!;
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/**
 * Who the push services can reach about these messages. Apple's refuses a
 * made-up address (403, BadJwtToken): it has to be a real https or mailto.
 */
const SUBJECT = process.env.PUSH_SUBJECT ?? "https://volume-trading-journal.up.railway.app";

/** What a send came to: how many devices took it, and the refusals, by status. */
export type PushResult = { devices: number; sent: number; failed: string[] };

/**
 * Sends a reminder to every device signed up. A device the push service no
 * longer knows (uninstalled, permission withdrawn) is dropped.
 */
export async function pushAll(message: PushMessage): Promise<PushResult> {
  const keys = await pushKeys();
  const devices = await prisma.pushDevice.findMany();
  const failed: string[] = [];
  let sent = 0;
  await Promise.all(
    devices.map(async (d) => {
      const service = new URL(d.endpoint).host;
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(message), {
          vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 600,
          urgency: "high",
        });
        sent++;
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        failed.push(`${service} ${err.statusCode ?? ""} ${(err.body ?? err.message ?? "").slice(0, 120)}`.trim());
        if (err.statusCode === 404 || err.statusCode === 410) await prisma.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
      }
    })
  );
  console.log(`push: "${message.title}" → ${sent}/${devices.length} appareil(s)${failed.length ? ` · refus : ${failed.join(" | ")}` : ""}`);
  return { devices: devices.length, sent, failed };
}

/** Sends once per key: a restart, or two ticks in the same minute, do not send it again. */
export async function pushOnce(key: string, message: PushMessage) {
  try {
    await prisma.pushSent.create({ data: { key } });
  } catch {
    return;
  }
  await pushAll(message);
}
