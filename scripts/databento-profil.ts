/**
 * Le profil de volume de chaque séance : POC, VAH et VAL.
 *
 *   npx tsx scripts/databento-profil.ts          # les 7 paires
 *   npx tsx scripts/databento-profil.ts 6E ZN    # celles-là seulement
 *
 * Lit les fichiers de trades Databento — une ligne par transaction, un prix et
 * une taille — et compte le volume échangé à chaque tick. Les bougies d'1 min
 * du cache ne peuvent pas répondre : elles ne gardent pas le volume, et même
 * avec lui un profil à la minute serait une approximation. Ici c'est le vrai
 * profil.
 *
 * Écrit <SYM>.profil.json dans le cache : par séance, [POC, VAH, VAL].
 * Le découpage des séances est celui du moteur, 17h Chicago à 17h.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { sessionDay } from "@/lib/databento/engine";
import { CONTRACTS } from "@/lib/contracts";

const DOWNLOADS = path.join(homedir(), "Downloads");
const CACHE = path.join(tmpdir(), "flux-databento");

/** Les archives de trades, les mêmes que le backtest, sans le CSV de bougies. */
const SOURCES: Record<string, string> = {
  "6B": "GLBX-20261113-578Q94WBNM",
  "6E": "GLBX-20261113-ULHBVEC84B",
  "6N": "GLBX-20261113-6B8HPAQ9AC",
  "6C": "GLBX-20261114-XT3UQKQJN8",
  ZN: "GLBX-20261114-5455U3L7DB",
  ZS: "GLBX-20261113-JL6JCCMRCH.zip",
  ZW: "GLBX-20261113-P985XH3AXW.zip",
};

/** La part du volume de la séance que la Value Area contient. */
const PART = 0.7;

type Compteurs = {
  /** volume par (contrat, séance, tick) */
  profils: Map<string, Map<number, number>>;
  /** volume par (jour calendaire, contrat), pour choisir le contrat de tête */
  parJour: Map<string, number>;
};

function lire(texte: string, tick: number, c: Compteurs) {
  const saut = texte.indexOf("\n");
  const entete = texte.slice(0, saut < 0 ? texte.length : saut).replace(/^﻿/, "").trim().toLowerCase().split(",");
  const col = (n: string) => entete.indexOf(n);
  const iT = ["ts_event", "ts_recv", "timestamp", "time"].map(col).find((i) => i >= 0) ?? -1;
  const iP = col("price");
  const iV = col("size") >= 0 ? col("size") : col("volume");
  const iS = col("symbol");
  const iA = col("action");
  if (iT < 0 || iP < 0 || iS < 0) throw new Error(`Colonnes manquantes : ${entete.join(", ")}`);

  let echelle = 0;
  let pos = saut < 0 ? texte.length : saut + 1;
  while (pos < texte.length) {
    let fin = texte.indexOf("\n", pos);
    if (fin < 0) fin = texte.length;
    const ligne = texte.slice(pos, fin);
    pos = fin + 1;
    if (ligne.length < 5) continue;
    const f = ligne.split(",");
    if (iA >= 0 && f[iA] !== "T") continue;
    const contrat = f[iS];
    // Les spreads entre échéances ne font pas partie du profil du contrat.
    if (!contrat || contrat.includes("-") || contrat.includes(" ")) continue;
    const brut = f[iP];
    if (echelle === 0) echelle = !brut.includes(".") && Math.abs(Number(brut)) > 1e6 ? 1e-9 : 1;
    const prix = Number(brut) * echelle;
    if (!Number.isFinite(prix) || prix <= 0) continue;
    const ts = f[iT];
    // Nanosecondes entières ou ISO, comme le parseur du journal les lit.
    const t = /^\d+$/.test(ts) ? (ts.length >= 16 ? Number(ts.slice(0, -6)) : ts.length >= 13 ? Number(ts) : Number(ts) * 1000) : Date.parse(ts.replace(" ", "T").replace(/\.(\d{3})\d*/, ".$1"));
    if (!Number.isFinite(t)) continue;
    const taille = iV >= 0 ? Number(f[iV]) || 0 : 1;
    if (taille <= 0) continue;

    const jour = Math.floor(t / 86400000);
    const kJour = `${jour}|${contrat}`;
    c.parJour.set(kJour, (c.parJour.get(kJour) ?? 0) + taille);

    const kProfil = `${contrat}|${sessionDay(t)}`;
    let m = c.profils.get(kProfil);
    if (!m) c.profils.set(kProfil, (m = new Map()));
    const k = Math.round(prix / tick);
    m.set(k, (m.get(k) ?? 0) + taille);
  }
}

/** POC, VAH et VAL d'une séance, en index de ticks. */
function valueArea(m: Map<number, number>): [number, number, number] | null {
  const ticks = [...m.keys()].sort((a, b) => a - b);
  if (!ticks.length) return null;
  let total = 0;
  let poc = ticks[0];
  for (const k of ticks) {
    const v = m.get(k)!;
    total += v;
    if (v > m.get(poc)!) poc = k;
  }
  const cible = total * PART;
  let i = ticks.indexOf(poc);
  let lo = i;
  let hi = i;
  let somme = m.get(poc)!;
  // On élargit du POC vers l'extérieur, toujours du côté qui a le plus
  // échangé, jusqu'à contenir 70 % du volume de la séance.
  while (somme < cible && (lo > 0 || hi < ticks.length - 1)) {
    const dessus = hi < ticks.length - 1 ? m.get(ticks[hi + 1])! : -1;
    const dessous = lo > 0 ? m.get(ticks[lo - 1])! : -1;
    if (dessus >= dessous) somme += m.get(ticks[++hi])!;
    else somme += m.get(ticks[--lo])!;
  }
  return [poc, ticks[hi], ticks[lo]];
}

const demandes = process.argv.slice(2).filter((a) => SOURCES[a]);
mkdirSync(CACHE, { recursive: true });

for (const symbol of demandes.length ? demandes : Object.keys(SOURCES)) {
  const tick = CONTRACTS[symbol].tickSize;
  const source = path.join(DOWNLOADS, SOURCES[symbol]);
  const c: Compteurs = { profils: new Map(), parJour: new Map() };
  const t0 = Date.now();
  if (source.endsWith(".zip")) {
    const liste = execFileSync("unzip", ["-Z1", source], { maxBuffer: 1e7 }).toString().split("\n").filter((f) => f.endsWith(".trades.csv")).sort();
    for (const f of liste) lire(execFileSync("unzip", ["-p", source, f], { maxBuffer: 2e9 }).toString(), tick, c);
  } else {
    for (const f of readdirSync(source).filter((f) => f.endsWith(".trades.csv")).sort()) lire(readFileSync(path.join(source, f), "utf8"), tick, c);
  }

  // Le contrat de tête, jour par jour : celui qui a le plus échangé, comme le
  // parseur du journal le choisit.
  const tete = new Map<number, string>();
  const mieux = new Map<number, number>();
  for (const [k, v] of c.parJour) {
    const [jour, contrat] = k.split("|");
    const d = Number(jour);
    if (v > (mieux.get(d) ?? -1)) {
      mieux.set(d, v);
      tete.set(d, contrat);
    }
  }

  const out: Record<string, [number, number, number]> = {};
  for (const [k, m] of c.profils) {
    const [contrat, jour] = k.split("|");
    const d = Number(jour);
    // La séance commence la veille à 17h Chicago : le contrat de tête est
    // celui de l'un des deux jours calendaires qu'elle couvre.
    if (tete.get(d) !== contrat && tete.get(d - 1) !== contrat) continue;
    const va = valueArea(m);
    if (!va) continue;
    const ancien = out[jour];
    // Deux contrats sur la même séance (jour de roll) : on garde le plus échangé.
    if (ancien) {
      const volAncien = [...(c.profils.get(`${tete.get(d)}|${jour}`) ?? new Map()).values()].reduce((a, b) => a + b, 0);
      const volCe = [...m.values()].reduce((a, b) => a + b, 0);
      if (volCe < volAncien) continue;
    }
    out[jour] = [va[0] * tick, va[1] * tick, va[2] * tick];
  }

  const file = path.join(CACHE, `${symbol}.profil.json`);
  writeFileSync(file, JSON.stringify(out));
  const jours = Object.keys(out);
  const ex = jours.length ? out[jours[jours.length - 1]] : null;
  console.log(
    `${symbol} ${jours.length} séances en ${((Date.now() - t0) / 1000).toFixed(0)} s` +
      (ex ? ` · dernière : POC ${ex[0].toFixed(5)} VAH ${ex[1].toFixed(5)} VAL ${ex[2].toFixed(5)}` : "")
  );
}
