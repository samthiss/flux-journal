/**
 * Ce que le bot d'exécution a le droit de lire et d'écrire.
 *
 * Le bot est un script Python qui tourne sur la machine du trader, donc
 * derrière sa box : le serveur ne peut pas l'appeler, c'est lui qui interroge
 * le journal. Il demande les ordres à poser et ceux à retirer, les exécute,
 * puis accuse réception — et c'est cet accusé qui marque la ligne et déclenche
 * la notification sur le téléphone.
 *
 * Tant qu'il n'a pas confirmé, `botSentAt` reste vide et la ligne le dit : un
 * ordre que le bot n'a pas passé n'existe pas chez le courtier, et le silence
 * ne doit pas ressembler à un succès.
 */
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { pushAll } from "@/lib/push";
import { pushPrefs } from "@/lib/planData";
import { sessionDate } from "@/lib/databento/clock";
import { dayKey } from "@/lib/tradingPlan";

/** La clé partagée, posée sur Railway. Sans elle la porte est fermée, pas ouverte. */
const CLE = () => process.env.BOT_API_KEY ?? "";

/**
 * Le porteur de la clé, ou null.
 *
 * Comparaison à temps constant : une comparaison ordinaire s'arrête au
 * premier caractère faux et laisse deviner la clé un caractère à la fois.
 */
export function cleValide(req: Request): boolean {
  const attendue = CLE();
  if (!attendue) return false;
  const donnee = req.headers.get("x-bot-key") ?? "";
  const a = Buffer.from(donnee);
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pourquoi la porte refuse, dans les termes d'une API. */
export function refus(req: Request): Response | null {
  if (!CLE()) return Response.json({ error: "BOT_API_KEY n'est pas configurée sur le serveur." }, { status: 503 });
  if (!cleValide(req)) return Response.json({ error: "Clé invalide." }, { status: 401 });
  return null;
}

export type OrdreBot = {
  id: string;
  symbol: string;
  /** "long" ou "short", en minuscules : un script n'a pas à gérer la casse du journal. */
  side: "long" | "short";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  level: number;
  /** Le jour de séance de Chicago, YYYY-MM-DD. */
  day: string;
  /** Depuis quand l'ordre attend, en ISO. */
  createdAt: string;
};

const vue = (o: {
  id: string;
  symbol: string;
  side: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  level: number;
  day: string;
  createdAt: Date;
}): OrdreBot => ({
  id: o.id,
  symbol: o.symbol,
  side: o.side === "Long" ? "long" : "short",
  entry: o.entry,
  sl: o.sl,
  tp1: o.tp1,
  tp2: o.tp2,
  level: o.level,
  day: o.day,
  createdAt: o.createdAt.toISOString(),
});

/**
 * Le travail qui attend le bot.
 *
 * À poser : les ordres de **la séance en cours** qu'il n'a pas confirmés. La
 * date compte : un ordre posé le 18 novembre et oublié en base ne doit pas
 * devenir un ordre réel dix jours plus tard — c'est pourtant ce qui se
 * passait, et trois lignes mortes attendaient en production. À retirer :
 * ceux qu'il a passés et que le journal a depuis annulés — parce qu'une autre
 * paire a été remplie, ou parce que le trader les a retirés à la main — et
 * dont le retrait n'est pas confirmé. Les deux listes sont vides la plupart
 * du temps ; c'est normal, le script peut interroger toutes les vingt
 * secondes sans rien coûter.
 */
export async function travailDuBot(): Promise<{ aPoser: OrdreBot[]; aRetirer: (OrdreBot & { raison: string })[] }> {
  const [poser, retirer] = await Promise.all([
    prisma.planOrder.findMany({ where: { day: dayKey(sessionDate(Date.now())), status: "pending", botSentAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.planOrder.findMany({ where: { status: "cancelled", botSentAt: { not: null }, botCancelAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    aPoser: poser.map(vue),
    aRetirer: retirer.map((o) => ({ ...vue(o), raison: o.cancelReason ?? "Annulé." })),
  };
}

/** Un prix lisible dans une notification, sans dépendre du tick de la paire. */
const joli = (p: number) => p.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");

/**
 * Ce que le bot répond : fait, ou échoué.
 *
 * Un échec est écrit sur la ligne plutôt que renvoyé au script seul, pour que
 * le trader le voie dans Ordres du jour sans aller lire un log.
 */
export async function reponseDuBot(id: string, quoi: "pose" | "retrait", erreur?: string) {
  const o = await prisma.planOrder.findUnique({ where: { id } });
  if (!o) return { status: 404 as const, corps: { error: "Ordre inconnu." } };

  if (erreur) {
    await prisma.planOrder.update({ where: { id }, data: { botError: String(erreur).slice(0, 300) } });
    return { status: 200 as const, corps: { ok: true, note: "Échec enregistré sur la ligne." } };
  }

  await prisma.planOrder.update({
    where: { id },
    data: quoi === "pose" ? { botSentAt: new Date(), botError: null } : { botCancelAt: new Date(), botError: null },
  });

  const prefs = await pushPrefs();
  if (prefs.bot) {
    const sens = o.side === "Long" ? "LONG" : "SHORT";
    await pushAll(
      quoi === "pose"
        ? { title: `Ordre passé · ${o.symbol} ${sens}`, body: `entrée ${joli(o.entry)} · SL ${joli(o.sl)} · TP1 ${joli(o.tp1)}`, url: "/trading-plan", tag: `bot-${id}` }
        : { title: `Ordre retiré · ${o.symbol} ${sens}`, body: o.cancelReason ?? `entrée ${joli(o.entry)}`, url: "/trading-plan", tag: `bot-annul-${id}` }
    );
  }
  return { status: 200 as const, corps: { ok: true } };
}
