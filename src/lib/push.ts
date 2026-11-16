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
 * Sends a reminder to every device signed up. A device the push service no
 * longer knows (uninstalled, permission withdrawn) is dropped.
 */
export async function pushAll(message: PushMessage) {
  const keys = await pushKeys();
  const devices = await prisma.pushDevice.findMany();
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(message), {
          vapidDetails: { subject: "mailto:journal@flux.invalid", publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 600,
          urgency: "high",
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
        else console.error("push:", status ?? e);
      }
    })
  );
  return devices.length;
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
