"use server";

import { prisma } from "@/lib/prisma";
import { exigeProprietaire } from "@/lib/session";
import { pushAll, pushKeys } from "@/lib/push";

/** The key a phone subscribes with. */
export async function pushPublicKey() {
  await exigeProprietaire();
  return (await pushKeys()).publicKey;
}

export async function addPushDevice(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await exigeProprietaire();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Abonnement invalide.");
  await prisma.pushDevice.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function removePushDevice(endpoint: string) {
  await exigeProprietaire();
  await prisma.pushDevice.deleteMany({ where: { endpoint } });
}

export async function sendTestPush() {
  await exigeProprietaire();
  return pushAll({ title: "Rappels activés", body: "Tu recevras les news 15 min avant, et la sortie à 4 h de tes trades.", url: "/trading-plan" });
}
