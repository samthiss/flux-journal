// Fills in NoteExampleImage.width / .height for rows written before those
// columns existed.
//
// Without them a tile reserves no height until its image arrives, the page
// grows under the reader, and a click in the sidebar lands on whichever section
// slid into place meanwhile — which is the bug this backfill closes for the
// images already stored.
//
// It runs on every boot (see the `start` script). That is deliberate: the
// production images live on the Railway volume, not in the repository, so there
// is no other moment at which they are all reachable. After the first pass the
// query matches nothing and the script costs one statement.
//
// Only our own uploads can be measured. The charts still served by base44 are
// remote, stay null, and keep the old unreserved tile.
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const UPLOAD_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "public", "uploads");

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const PREFIX = "/api/uploads/";

async function measure(url: string) {
  if (!url.startsWith(PREFIX)) return null;
  const filename = url.slice(PREFIX.length).split("?")[0];
  // The name reached the database from a request; only a bare filename is read.
  if (!filename || filename !== path.basename(filename)) return null;
  try {
    const { width, height } = await sharp(await readFile(path.join(UPLOAD_DIR, filename))).metadata();
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

async function main() {
  const rows = await prisma.noteExampleImage.findMany({
    where: { OR: [{ width: null }, { height: null }] },
    select: { id: true, url: true },
  });
  if (!rows.length) {
    console.log("backfill-image-dimensions: rien à faire");
    return;
  }

  let filled = 0;
  let skipped = 0;
  for (const row of rows) {
    const size = await measure(row.url);
    if (!size) {
      skipped++;
      continue;
    }
    await prisma.noteExampleImage.update({ where: { id: row.id }, data: size });
    filled++;
  }
  console.log(`backfill-image-dimensions: ${filled} mesurées, ${skipped} non mesurables sur ${rows.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // A boot must not be blocked by this: the app works without the dimensions,
    // it only shifts while loading, exactly as it did before the columns existed.
    console.error("backfill-image-dimensions:", e);
    await prisma.$disconnect();
  });
