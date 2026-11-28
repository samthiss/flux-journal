/**
 * Le volume échangé par minute, que le cache de bougies ne garde pas.
 *
 *   npx tsx scripts/databento-volume.ts 6E
 *
 * Nécessaire au VWAP, qui pondère chaque prix par ce qui s'y est traité. Les
 * fichiers de trades Databento sont relus une fois et le volume de chaque
 * minute du contrat de tête est écrit dans <SYM>.vol.bin : un Float64Array
 * où [0] est le nombre de minutes, puis les horodatages, puis les volumes.
 *
 * Le jour où l'historique sera téléchargé en ohlcv-1m, ce script devient
 * inutile — ce schéma porte déjà la colonne volume.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const DOWNLOADS = path.join(homedir(), "Downloads");
const CACHE = path.join(tmpdir(), "flux-databento");

const SOURCES: Record<string, string> = {
  "6B": "GLBX-20261113-578Q94WBNM",
  "6E": "GLBX-20261113-ULHBVEC84B",
  "6N": "GLBX-20261113-6B8HPAQ9AC",
  "6C": "GLBX-20261114-XT3UQKQJN8",
  ZN: "GLBX-20261114-5455U3L7DB",
  ZS: "GLBX-20261113-JL6JCCMRCH.zip",
  ZW: "GLBX-20261113-P985XH3AXW.zip",
};

type Compteurs = {
  /** volume par (contrat, minute) */
  minutes: Map<string, number>;
  /** volume par (jour calendaire, contrat), pour le contrat de tête */
  parJour: Map<string, number>;
};

function lire(texte: string, c: Compteurs) {
  const saut = texte.indexOf("\n");
  const entete = texte.slice(0, saut < 0 ? texte.length : saut).replace(/^﻿/, "").trim().toLowerCase().split(",");
  const col = (n: string) => entete.indexOf(n);
  const iT = ["ts_event", "ts_recv"].map(col).find((i) => i >= 0) ?? -1;
  const iV = col("size") >= 0 ? col("size") : col("volume");
  const iS = col("symbol");
  const iA = col("action");
  if (iT < 0 || iS < 0) throw new Error(`Colonnes manquantes : ${entete.join(", ")}`);

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
    if (!contrat || contrat.includes("-") || contrat.includes(" ")) continue;
    const ts = f[iT];
    const t = /^\d+$/.test(ts) ? (ts.length >= 16 ? Number(ts.slice(0, -6)) : ts.length >= 13 ? Number(ts) : Number(ts) * 1000) : Date.parse(ts.replace(" ", "T").replace(/\.(\d{3})\d*/, ".$1"));
    if (!Number.isFinite(t)) continue;
    const taille = iV >= 0 ? Number(f[iV]) || 0 : 1;
    if (taille <= 0) continue;
    const m = Math.floor(t / 60000) * 60000;
    const k = `${contrat}|${m}`;
    c.minutes.set(k, (c.minutes.get(k) ?? 0) + taille);
    const kj = `${Math.floor(t / 86400000)}|${contrat}`;
    c.parJour.set(kj, (c.parJour.get(kj) ?? 0) + taille);
  }
}

mkdirSync(CACHE, { recursive: true });
const demandes = process.argv.slice(2).filter((a) => SOURCES[a]);

for (const symbol of demandes.length ? demandes : Object.keys(SOURCES)) {
  const source = path.join(DOWNLOADS, SOURCES[symbol]);
  const c: Compteurs = { minutes: new Map(), parJour: new Map() };
  const t0 = Date.now();
  if (source.endsWith(".zip")) {
    const liste = execFileSync("unzip", ["-Z1", source], { maxBuffer: 1e7 }).toString().split("\n").filter((f) => f.endsWith(".trades.csv")).sort();
    for (const f of liste) lire(execFileSync("unzip", ["-p", source, f], { maxBuffer: 2e9 }).toString(), c);
  } else {
    for (const f of readdirSync(source).filter((f) => f.endsWith(".trades.csv")).sort()) lire(readFileSync(path.join(source, f), "utf8"), c);
  }

  // Le contrat de tête, jour par jour : celui qui a le plus échangé.
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

  const garde: [number, number][] = [];
  for (const [k, v] of c.minutes) {
    const i = k.lastIndexOf("|");
    const contrat = k.slice(0, i);
    const m = Number(k.slice(i + 1));
    if (tete.get(Math.floor(m / 86400000)) !== contrat) continue;
    garde.push([m, v]);
  }
  garde.sort((a, b) => a[0] - b[0]);

  const buf = new Float64Array(1 + 2 * garde.length);
  buf[0] = garde.length;
  garde.forEach(([m, v], i) => {
    buf[1 + i] = m;
    buf[1 + garde.length + i] = v;
  });
  writeFileSync(path.join(CACHE, `${symbol}.vol.bin`), Buffer.from(buf.buffer));
  console.log(`${symbol} ${garde.length} minutes en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
