/**
 * The trade vocabulary, shared by the pages that write in it.
 *
 * The words themselves are data — a type exists as long as something is
 * described with it — but these five ship with the app so the list is never
 * empty, and the colouring is here so a tag looks the same wherever it is
 * shown: on an example in the notes, and on a trade idea in the checklist.
 */
export const TRADE_TYPES = [
  "Rebond sur range",
  "Trend",
  "Range",
  "Contre la tendance",
  "Revient dans la VA / VWAP & Rebondit",
] as const;

/**
 * The setups that ship with the app.
 *
 * The setup is what a confirmation hangs off: the same word can be worth
 * looking for on a trend run and meaningless on a reverse, so the list of
 * confirmations offered is the one that setup has already used. Like every
 * other vocabulary here, these two are only a starting point.
 */
export const SETUPS = ["Trend run", "Backtest reverse"] as const;

/**
 * The setup a checklist line stands for, if it stands for one.
 *
 * The Trading Plan holds one line per setup — "Trend Run (TR) : …" and
 * "Backtest Reverse (BR) : …" — so an idea written under one of them is an
 * idea for that setup. Nothing has to be picked: where it was written says it.
 * The match is on the opening words, since the rest of the line is its
 * description and the reader may reword it.
 */
export function setupDeLigne(label: string | null | undefined) {
  const debut = (label ?? "").trim().toLowerCase();
  if (debut.startsWith("trend run")) return "Trend run";
  if (debut.startsWith("backtest reverse")) return "Backtest reverse";
  return null;
}

/**
 * The vocabulary a word belongs to: the list, and the setup it was written
 * under when there is one.
 *
 * Kept in the kind rather than in a column of its own — a vocabulary has never
 * had a table here, and "confirmationsBox@Trend run" is the same idea as the
 * notes': a word belongs to the setup it was used under.
 */
export function kindPourSetup(kind: string, setup: string | null | undefined) {
  return setup ? `${kind}@${setup}` : kind;
}

/** The list a kind names, with any setup stripped off. */
export function kindDeBase(kind: string) {
  return kind.split("@")[0];
}

/**
 * The zones that ship with the app. The value stored is the word itself, so the
 * list can grow the way the trade types and the confirmations do.
 */
export const ZONES = ["Zone de retournement", "Stunden Cluster"] as const;

/**
 * A colour per tag, the same one everywhere.
 *
 * Twelve chips in one row all lit the same way are a wall of text; given their
 * own hue they become recognisable at a glance, and the eye can follow one
 * confirmation from example to example. The hue comes from the word itself, so
 * a tag keeps its colour across cards, across filters, and across reloads
 * without anything being stored — and two tags that collide simply share, which
 * costs nothing.
 */
const TAG_HUES = [196, 165, 78, 300, 340, 250, 130, 30, 220, 55];

export function tagTone(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  const hue = TAG_HUES[hash % TAG_HUES.length];
  return {
    fg: `oklch(0.84 0.15 ${hue})`,
    bg: `oklch(0.84 0.15 ${hue} / 0.14)`,
    line: `oklch(0.84 0.15 ${hue} / 0.45)`,
  };
}

/** Reads one of the JSON string arrays the annotations are stored as. */
export function parseTagArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
