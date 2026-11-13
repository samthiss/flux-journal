import { EXIT_LABELS, kindOf, type Bucket, type Config, type ConfigStats, type SymbolResult } from "./engine";

/**
 * Rules read off an analysis, in words.
 *
 * Every line says what to do and the figures it rests on, so the reader can
 * disagree with it. Nothing here is computed that the page does not also
 * show: this is the same analysis, put as decisions.
 */
export type Reco = { tone: "rule" | "ok" | "warn"; text: string };

const usd = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)} $`;
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const day = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function exitText(c: Config): string {
  const k = kindOf(c);
  if (k === "fixed") return c.tp1 === c.tp2 ? `TP unique à ${c.tp1} ticks` : `½ à TP1 ${c.tp1} ticks (SL → BE), ½ à TP2 ${c.tp2} ticks`;
  const trail = `une fois +${c.act} ticks, stop suiveur à ${c.dist} ticks du meilleur prix`;
  if (k === "trail") return `pas de TP : ${trail}`;
  return `½ à TP1 ${c.tp1} ticks (SL → BE), l'autre ½ : ${trail}`;
}

export function entryText(offset: number): string {
  if (offset === 0) return "ordre limite pile sur le niveau";
  return offset > 0 ? `ordre limite ${offset} ticks avant le niveau` : `ordre limite ${-offset} ticks au-delà du niveau`;
}

export function recommend(r: SymbolResult, c: ConfigStats): Reco[] {
  const out: Reco[] = [];
  const fmtZone = (z: string) => z.replace(".", ",");

  // 1. The rule itself.
  out.push({ tone: "rule", text: `Entrée : ${entryText(c.cfg.offset)}. Stop initial : ${c.cfg.sl} ticks. Sortie : ${exitText(c.cfg)}.` });

  // 2. Which way out pays.
  const exits = r.byExit ?? [];
  if (exits.length > 1) {
    const sorted = [...exits].sort((a, b) => b.pnl - a.pnl);
    const [first, second] = sorted;
    out.push({
      tone: "ok",
      text: `Meilleure sortie : ${EXIT_LABELS[first.value as keyof typeof EXIT_LABELS] ?? first.value} (${usd(first.pnl)}), devant ${
        EXIT_LABELS[second.value as keyof typeof EXIT_LABELS] ?? second.value
      } (${usd(second.pnl)}).`,
    });
  }
  const trails = r.byTrail ?? [];
  if (trails.length) {
    const t = trails.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    const [act, dist] = t.value.split("/");
    out.push({ tone: "ok", text: `Meilleur trailing : déclenché à +${act} ticks, à ${dist} ticks du prix (${usd(t.pnl)} sur ${t.n} trades).` });
  }

  // 3. Levels.
  const levels = Object.entries(c.zones);
  for (const [z, b] of levels) {
    if (b.pnl < 0 && b.n >= 3) out.push({ tone: "warn", text: `Le niveau ${fmtZone(z)} perd (${usd(b.pnl)} sur ${b.n} trades, ${pct(b.wins / b.n)} gagnants) : à retirer ou à revoir.` });
  }
  const goodLevels = levels.filter(([, b]) => b.pnl > 0).map(([z]) => fmtZone(z));
  if (goodLevels.length && goodLevels.length < levels.length) out.push({ tone: "ok", text: `Niveaux qui paient : ${goodLevels.join(", ")}.` });

  // 4. Direction.
  if (c.dirs) {
    const long = c.dirs.long, short = c.dirs.short;
    const side = (name: string, b: Bucket | undefined, other: Bucket | undefined) => {
      if (b && b.n >= 5 && b.pnl < 0 && other && other.pnl > 0)
        out.push({ tone: "warn", text: `Les ${name} perdent (${usd(b.pnl)} sur ${b.n}) alors que l'autre sens gagne (${usd(other.pnl)}) : ne prendre que l'autre sens.` });
    };
    side("longs", long, short);
    side("shorts", short, long);
  }

  // 5. Hours, Paris time.
  if (c.hours) {
    const hours = Object.entries(c.hours).filter(([, b]) => b.n >= 3);
    const bad = hours.filter(([, b]) => b.pnl < 0).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 3);
    if (bad.length)
      out.push({
        tone: "warn",
        text: `Heures à éviter (heure de Paris) : ${bad.map(([h, b]) => `${h}h–${Number(h) + 1}h (${usd(b.pnl)}, ${b.n} trades)`).join(", ")}.`,
      });
    const good = hours.filter(([, b]) => b.pnl > 0).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 3);
    if (good.length) out.push({ tone: "ok", text: `Meilleures heures : ${good.map(([h, b]) => `${h}h–${Number(h) + 1}h (${usd(b.pnl)})`).join(", ")}.` });
  }

  // 6. Does it hold?
  const v = r.validation;
  if (v) {
    const text = `Test hors échantillon : la config choisie sur ${day(r.from)} → ${day(v.split)} (${usd(v.inPnl)}, ${v.inN} trades) a fait ${usd(v.outPnl)} sur la suite jusqu'au ${day(r.to)} (${v.outN} trades, ${pct(v.outWin)} gagnants).`;
    out.push({ tone: v.outN > 0 && v.outPnl > 0 ? "ok" : "warn", text: v.outPnl > 0 ? text : `${text} Elle ne tient pas sur des données qu'elle n'a pas vues.` });
  }
  const nb = r.neighbours;
  if (nb && c.key === r.top[0]?.key) {
    const share = nb.positive / nb.n;
    out.push({
      tone: share >= 0.6 ? "ok" : "warn",
      text:
        share >= 0.6
          ? `Résultat solide : ${nb.positive} configs voisines sur ${nb.n} gagnent aussi (moyenne ${usd(nb.avgPnl)}).`
          : `Résultat fragile : seulement ${nb.positive} configs voisines sur ${nb.n} gagnent (moyenne ${usd(nb.avgPnl)}) — un pic isolé, pas une zone stable.`,
    });
  }
  const months = Object.values(c.months);
  if (months.length) {
    const pos = months.filter((m) => m.pnl > 0).length;
    out.push({ tone: pos / months.length >= 0.6 ? "ok" : "warn", text: `${pos} mois positifs sur ${months.length}.` });
  }
  if (c.n < 30) out.push({ tone: "warn", text: `Seulement ${c.n} trades : trop peu pour conclure. Ajoute des niveaux ou des symboles.` });
  if (c.maxDD > 0) out.push({ tone: "ok", text: `Drawdown max ${usd(-c.maxDD)} : prévoir au moins ${Math.ceil((c.maxDD * 1.5) / 100) * 100} $ de marge pour ce symbole avec ${r.settings.lots} lots.` });

  return out;
}
