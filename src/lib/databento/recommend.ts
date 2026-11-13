import { EXIT_LABELS, NEWS_BUCKETS, NEWS_LABELS, kindOf, type Bucket, type Config, type ConfigStats, type NewsMode, type SymbolResult } from "./engine";

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

/** The rule about releases, in words, or null when the config trades through them. */
export function newsRule(mode: NewsMode | undefined, r: SymbolResult): string | null {
  const cur = r.newsInfo?.currencies.join("/") ?? "";
  if (mode === "window") return `News : pas de trade à ±${r.newsInfo?.window ?? 30} min d'une annonce ${cur} à fort impact.`;
  if (mode === "day") return `News : pas de trade les jours d'annonce ${cur} à fort impact.`;
  return null;
}

export function recommend(r: SymbolResult, c: ConfigStats): Reco[] {
  const out: Reco[] = [];
  const fmtZone = (z: string) => z.replace(".", ",");

  // 1. The rule itself.
  out.push({ tone: "rule", text: `Entrée : ${entryText(c.cfg.offset)}. Stop initial : ${c.cfg.sl} ticks. Sortie : ${exitText(c.cfg)}.` });
  const nr = newsRule(c.cfg.news, r);
  if (nr) out.push({ tone: "rule", text: nr });

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

  // 2b. The releases.
  if (r.newsInfo === null) out.push({ tone: "warn", text: "Historique des news indisponible pendant l'analyse : relance-la pour tenir compte des annonces." });
  const byNews = r.byNews ?? [];
  if (byNews.length > 1) {
    const all = byNews.find((b) => b.value === "all");
    const top = [...byNews].sort((a, b) => b.pnl - a.pnl)[0];
    if (all && top.value !== "all")
      out.push({ tone: "ok", text: `${NEWS_LABELS[top.value as NewsMode]} : ${usd(top.pnl)} contre ${usd(all.pnl)} en tradant toutes les séances.` });
    else if (all) out.push({ tone: "ok", text: `Éviter les news ne paie pas ici : tout trader fait le mieux (${usd(all.pnl)}).` });
  }
  if (c.news) {
    const w = c.news[NEWS_BUCKETS.window];
    const win = r.newsInfo?.window ?? 30;
    if (w && w.n >= 3 && w.pnl < 0)
      out.push({ tone: "warn", text: `Les trades à ±${win} min d'une news perdent (${usd(w.pnl)} sur ${w.n}) : retirer l'ordre avant les annonces.` });
    const q = c.news[NEWS_BUCKETS.quiet], d = c.news[NEWS_BUCKETS.day];
    if (q && d && q.n >= 3 && d.n >= 3)
      out.push({ tone: "ok", text: `Jours sans news : ${usd(q.pnl)} (${q.n} trades, ${pct(q.wins / q.n)}) · jours de news hors fenêtre : ${usd(d.pnl)} (${d.n} trades, ${pct(d.wins / d.n)}).` });
  }
  if (c.newsTitles) {
    const worst = Object.entries(c.newsTitles).filter(([, b]) => b.n >= 3 && b.pnl < 0).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 4);
    if (worst.length) out.push({ tone: "warn", text: `Jours à éviter : ${worst.map(([t, b]) => `${t} (${usd(b.pnl)}, ${b.n} trades)`).join(", ")}.` });
  }

  // 2c. The trader's own rules: what each one did, by taking it away.
  const impact = r.rulesImpact ?? [];
  if (impact.length && c.key === r.top[0]?.key) {
    const withAll = impact[0];
    for (const x of impact.slice(1, -1)) {
      const delta = withAll.pnl - x.pnl;
      const rule = x.label.replace(/^sans /, "");
      const dd = x.maxDD - withAll.maxDD;
      const ddText = Math.abs(dd) >= 1 ? `, drawdown ${dd > 0 ? "réduit" : "augmenté"} de ${Math.abs(dd).toFixed(0)} $` : "";
      if (Math.abs(delta) < 1 && Math.abs(dd) < 1) out.push({ tone: "ok", text: `Règle ${rule} : sans effet sur cette période.` });
      else if (delta >= 0) out.push({ tone: "ok", text: `Règle ${rule} : utile, ${usd(delta)}${ddText} (${x.n} → ${withAll.n} trades).` });
      else out.push({ tone: "warn", text: `Règle ${rule} : coûte ${usd(delta)}${ddText} (${x.n} → ${withAll.n} trades). À reconsidérer.` });
    }
  }
  if (r.rules?.blackout && !r.majorReleases) out.push({ tone: "warn", text: "Blackout news non appliqué : le calendrier n'a pas pu être lu pendant l'analyse." });
  const fixedBest = (r.byExit ?? []).find((b) => b.value === "fixed");
  if (fixedBest && kindOf(c.cfg) !== "fixed")
    out.push({
      tone: "warn",
      text: `Ta règle « bracket complet SL + TP dès l'entrée » : la meilleure config en bracket fixe fait ${usd(fixedBest.pnl)}, contre ${usd(c.pnl)} avec un trailing.`,
    });

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

  // 5. Hours, on the clock the analysis used.
  const clock = r.hoursTz === "America/Chicago" ? "heure de Chicago" : "heure de Paris";
  if (c.hours) {
    const hours = Object.entries(c.hours).filter(([, b]) => b.n >= 3);
    const bad = hours.filter(([, b]) => b.pnl < 0).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 3);
    if (bad.length)
      out.push({
        tone: "warn",
        text: `Heures à éviter (${clock}) : ${bad.map(([h, b]) => `${h}h–${Number(h) + 1}h (${usd(b.pnl)}, ${b.n} trades)`).join(", ")}.`,
      });
    const good = hours.filter(([, b]) => b.pnl > 0).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 3);
    if (good.length) out.push({ tone: "ok", text: `Meilleures heures (${clock}) : ${good.map(([h, b]) => `${h}h–${Number(h) + 1}h (${usd(b.pnl)})`).join(", ")}.` });
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
