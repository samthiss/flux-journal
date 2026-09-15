/**
 * Asks the agent a question from the terminal.
 *
 *   npx tsx scripts/agent-ask.ts "combien de box cluster par heure ?"
 *
 * Tested here before it is given a page: the loop, the tools and the prompt
 * fail in different ways, and a terminal shows which one did.
 */
import "dotenv/config";
import { demander } from "../src/lib/agent/run";

async function main() {
  const question = process.argv.slice(2).join(" ");
  if (!question) {
    console.error("Pose une question : npx tsx scripts/agent-ask.ts \"...\"");
    process.exit(1);
  }

  console.log(`\n❯ ${question}\n`);
  const debut = Date.now();

  const { reponse } = await demander(question, (etape) => {
    if (etape.type === "outil") {
      console.log(`  · ${etape.nom}(${JSON.stringify(etape.entree).slice(0, 90)})`);
    }
  });

  console.log(`\n${reponse}\n`);
  console.log(`— ${((Date.now() - debut) / 1000).toFixed(1)} s`);
}

main().then(() => process.exit(0));
