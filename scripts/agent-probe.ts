/**
 * What the agent's tools return, on questions whose answers are known.
 *
 * Run before touching the search: the agent can only be as good as what these
 * hand it, and every ranking rule in journal.ts was written against a failure
 * seen here. The last two questions are the important ones — they have no
 * answer in the journal, and the tool has to return nothing rather than the
 * nearest passage, or the agent will build a rule out of whatever it was given.
 *
 *   npx tsx scripts/agent-probe.ts
 */
import "dotenv/config";
import { chercherNotes, lireNote, imagesDe, interrogerTrades, lireVolumeAlert, lireChecklist } from "../src/lib/agent/journal";

const QUESTIONS: [question: string, attendu: string][] = [
  ["combien de box cluster je veux voir par heure", "la règle 1-3 par heure, dans Trend run"],
  ["que faire quand un nouveau cluster tombe pendant mon trade", "sortir de la position"],
  ["ma règle pour placer le stop loss", "un bloc règles avec Stop-Loss"],
  ["rappelle moi mes confirmations pour trend run", "la note Trend run"],
  ["quelle est ma règle pour les jours de changement de contrat", "rien : ce n'est pas écrit"],
  ["quelle est ma règle sur les crypto monnaies", "rien : ce n'est pas écrit"],
];

async function main() {
  for (const [question, attendu] of QUESTIONS) {
    const hits = await chercherNotes(question, 3);
    console.log(`\n═══ ${question}\n    attendu : ${attendu}`);
    if (hits.length === 0) {
      console.log("  → rien de pertinent");
      continue;
    }
    hits.forEach((hit, i) =>
      console.log(`  ${i + 1}. ${hit.chemin} [${hit.ou}]  ${hit.extrait.replace(/\s+/g, " ").slice(0, 110)}`),
    );
  }

  console.log("\n\n═══ lireNote(\"Box cluster\") — une note sans texte");
  console.log(await lireNote("Box cluster"));

  console.log("\n═══ imagesDe(\"Box cluster\")");
  console.log((await imagesDe("Box cluster")).map((i) => `${i.url} — ${i.legende || "sans légende"}`).join("\n"));

  console.log("\n═══ interrogerTrades({ setup: \"Trend run\", symbole: \"6B\" })");
  console.log(await interrogerTrades({ setup: "Trend run", symbole: "6B" }));

  console.log("\n═══ lireVolumeAlert()");
  console.log((await lireVolumeAlert()).split("\n").slice(0, 4).join("\n"));

  console.log("\n═══ lireChecklist() — premier groupe");
  console.log(await lireChecklist().then((t) => t.split("\n\n")[0]));
}

main().then(() => process.exit(0));
