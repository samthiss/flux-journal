/**
 * Two touch-ups to the checklist, applied wherever it already exists.
 *
 * The first: three items named their own possible answers in prose — "(Tendance
 * / Range)", and the question of whether the week's picture matches the wider
 * view — with nowhere to record which one it was. They become tickable answers
 * instead of a parenthesis.
 *
 * The second: the two strategy lines are opened to trade ideas, since deciding
 * what to trade today is what that step of the checklist is for.
 *
 * The third: the group titles carried "CP" and "RC", the chart abbreviations
 * from the original German checklist. They named the tool rather than the step,
 * and meant nothing to anyone reading the list; the time window they were
 * bundled with is kept.
 *
 * A boot script rather than a data migration, because production's labels are
 * translated by the scripts that run after `migrate deploy`: matching French
 * there is only safe once those have run. The German wordings are matched too,
 * in case this ever runs first.
 *
 * Idempotent both ways: an item that already carries answers is left alone, so
 * a reader who removed or reworded them does not get them back on the next
 * deploy, and a title with no abbreviation left in it is not rewritten.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const TREND_RANGE = ["Tendance", "Range"];
const YES_NO = ["Oui", "Non"];

/**
 * Matched on a pattern rather than a fragment.
 *
 * The wording differs between the copy this repository was written against and
 * the one in production — "À quoi ressemble l'image des derniers jours ?" there
 * reads "Comment le marché a-t-il évolué les derniers jours ?" — and an exact
 * fragment matched one and missed the other, leaving that question without its
 * answers. What the two share is the question they ask, so that is what is
 * matched, in both languages.
 *
 * Narrow enough not to catch its neighbours: "Marquer les clusters horaires des
 * derniers jours – lesquels influencent l'évolution du cours ?" says évolution
 * but never asks how, and "Comment était mon entrée ?" asks how but not of the
 * market.
 */
const RULES: { match: RegExp; options: string[] }[] = [
  {
    match: /comment\s+le\s+march[ée].*(?:évolu|evolu)|wie\s+hat\s+sich\s+der\s+markt.*entwickelt|à\s+quoi\s+ressemble.*image|wie\s+sieht\s+das\s+bild/i,
    options: TREND_RANGE,
  },
  {
    match: /cette\s+image\s+correspond|entspricht\s+dieses\s+bild/i,
    options: YES_NO,
  },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    const items = await prisma.checklistItem.findMany({ where: { options: null } });
    let changed = 0;
    for (const item of items) {
      const rule = RULES.find((r) => r.match.test(item.label));
      if (!rule) continue;
      // The answers are now chips under the line, so the label repeating them
      // in a parenthesis says the same thing twice.
      const label = item.label.replace(/\s*\((?:Tendance|Trend)\s*\/\s*Range\)/g, "");
      await prisma.checklistItem.update({
        where: { id: item.id },
        data: { options: JSON.stringify(rule.options), label },
      });
      changed++;
    }
    if (changed) console.log(`checklist-touchups: ${changed} question(s) ont maintenant des réponses.`);

    // The lines a trade idea can hang under. Matched on the strategy's name,
    // which is the same in both languages; only ever turned on, so a reader who
    // moved ideas elsewhere is not overruled on the next deploy.
    const strategies = await prisma.checklistItem.findMany({ where: { allowsIdeas: false } });
    for (const item of strategies) {
      if (!/Trend Run|Backtest Reverse/i.test(item.label)) continue;
      await prisma.checklistItem.update({ where: { id: item.id }, data: { allowsIdeas: true } });
      console.log(`checklist-touchups: idées de trade activées sur « ${item.label.slice(0, 40)}… »`);
    }

    // "(CP, 1 mois)" keeps its window and loses the chart; "(CP, RC)" has
    // nothing left worth a parenthesis.
    const groups = [...new Set((await prisma.checklistItem.findMany({ select: { group: true } })).map((g) => g.group))];
    for (const group of groups) {
      const renamed = group
        .replace(/\s*\((?:CP|RC)(?:\s*[,/]\s*(?:CP|RC))*\)/g, "")
        .replace(/\((?:CP|RC)\s*[,/]\s*/g, "(")
        .trim();
      if (renamed === group || !renamed) continue;
      await prisma.checklistItem.updateMany({ where: { group }, data: { group: renamed } });
      console.log(`checklist-touchups: « ${group} » → « ${renamed} »`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // A failed touch-up must not keep the journal from starting.
  console.error("checklist-touchups: échec", err);
});
