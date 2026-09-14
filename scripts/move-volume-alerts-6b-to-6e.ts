/**
 * The volume alert hours filled in under 6B, moved to 6E.
 *
 * A session's worth of hours was typed while the form was believed to be on
 * 6E and was in fact still on 6B — the market was not being kept across a
 * refresh at the time. Nothing was ever recorded on 6B on purpose, so the whole
 * contract moves rather than a chosen day.
 *
 * Runs at boot because the rows are in production and cannot be reached from a
 * session. It is one-way and idempotent: once no 6B row is left it does
 * nothing, and it never overwrites an hour already recorded on 6E — the same
 * day and hour existing on both means the 6E one was typed deliberately, so
 * the 6B row is left where it is and named in the log.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const FROM = "6B";
const TO = "6E";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });

  try {
    const rows = await prisma.volumeAlertHour.findMany({ where: { market: FROM } });
    if (rows.length === 0) return;

    const taken = await prisma.volumeAlertHour.findMany({
      where: { market: TO },
      select: { day: true, hour: true },
    });
    const occupied = new Set(taken.map(({ day, hour }) => `${day} ${hour}`));

    let moved = 0;
    const kept: string[] = [];
    for (const row of rows) {
      if (occupied.has(`${row.day} ${row.hour}`)) {
        kept.push(`${row.day} ${row.hour}h`);
        continue;
      }
      await prisma.volumeAlertHour.update({ where: { id: row.id }, data: { market: TO } });
      moved++;
    }

    console.log(`Volume alert : ${moved} heure(s) déplacée(s) de ${FROM} vers ${TO}.`);
    if (kept.length > 0) {
      console.log(`  laissées sur ${FROM}, déjà enregistrées sur ${TO} : ${kept.join(", ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
