/**
 * Les ordres envoyés au bot Telegram qui les passe.
 *
 * Deux variables d'environnement, posées sur Railway et jamais dans le code :
 * `TELEGRAM_BOT_TOKEN` (le jeton que BotFather donne) et `TELEGRAM_CHAT_ID`
 * (la conversation où le bot écoute). Sans elles, rien n'est envoyé et l'ordre
 * porte la raison, pour que le silence ne passe pas pour un succès.
 *
 * L'envoi est volontairement synchrone, et non repoussé après la réponse avec
 * `after` : il s'agit d'un ordre réel, donc le résultat doit être sur la ligne
 * au moment où elle s'affiche, pas au prochain rafraîchissement.
 */

/**
 * Les prix partent en décimal, jamais en 32e ni en 8e : un bot n'a pas à
 * deviner 107'14.
 *
 * Le nombre de décimales vient du tick de la paire, pas du prix : 1,11900 et
 * non 1,119, pour que l'ordre et son annulation portent la même chaîne même
 * si le bot les compare au caractère.
 */
const decimales = (tick: number) => {
  const s = tick.toString();
  const point = s.indexOf(".");
  return point < 0 ? 0 : s.length - point - 1;
};
const prix = (p: number, tick: number) => p.toFixed(decimales(tick));

export type Envoi = { ok: true } | { ok: false; erreur: string };

/** Ce qu'il manque pour envoyer, ou rien. */
export function telegramManquant(): string | null {
  const absent = [
    !process.env.TELEGRAM_BOT_TOKEN && "TELEGRAM_BOT_TOKEN",
    !process.env.TELEGRAM_CHAT_ID && "TELEGRAM_CHAT_ID",
  ].filter(Boolean);
  return absent.length ? `Telegram non configuré (${absent.join(", ")} absent${absent.length > 1 ? "s" : ""})` : null;
}

/**
 * Un message au bot.
 *
 * Dix secondes au plus : une API qui ne répond pas ne doit pas retenir la
 * page. Le jeton ne sort jamais dans un message d'erreur — il est dans l'URL,
 * donc l'URL n'est pas rapportée.
 */
export async function envoyer(texte: string): Promise<Envoi> {
  const manque = telegramManquant();
  if (manque) return { ok: false, erreur: manque };
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: texte, disable_notification: false }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) {
      // Telegram répond en JSON jusque dans ses refus : sa description dit
      // précisément ce qui manque (jeton invalide, bot pas démarré, chat inconnu).
      const corps = (await res.json().catch(() => null)) as { description?: string } | null;
      return { ok: false, erreur: `Telegram ${res.status}${corps?.description ? ` : ${corps.description}` : ""}` };
    }
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: m.includes("timeout") || m.includes("aborted") ? "Telegram : pas de réponse en 10 s" : `Telegram : ${m}` };
  }
}

export type OrdreTexte = {
  symbol: string;
  side: string;
  level: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  lots: number;
  /** Le tick de la paire, qui fixe le nombre de décimales. */
  tick: number;
};

/** L'ordre à poser, tel que le bot le lit. */
export function texteOrdre(o: OrdreTexte): string {
  const p = (x: number) => prix(x, o.tick);
  return [
    `${o.symbol} ${o.side === "Long" ? "LONG" : "SHORT"}`,
    `entrée ${p(o.entry)}`,
    `SL ${p(o.sl)}`,
    `TP1 ${p(o.tp1)}`,
    ...(o.tp2 !== null ? [`TP2 ${p(o.tp2)}`] : []),
    `${o.lots} lots`,
    `niveau ${p(o.level)}`,
  ].join("\n");
}

/** L'ordre à retirer : même en-tête, pour que le bot retrouve lequel. */
export function texteAnnulation(o: { symbol: string; side: string; level: number; entry: number; tick: number }, raison: string): string {
  return [`ANNULER ${o.symbol} ${o.side === "Long" ? "LONG" : "SHORT"}`, `entrée ${prix(o.entry, o.tick)}`, `niveau ${prix(o.level, o.tick)}`, raison].join("\n");
}
