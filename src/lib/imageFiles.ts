import { unlink } from "node:fs/promises";
import path from "node:path";
import { CHART_SLOTS } from "@/lib/chartSlots";
import { prisma } from "@/lib/prisma";
import { deleteThumbnails } from "@/lib/thumbnails";
import { UPLOAD_DIR } from "@/lib/uploadDir";

// A file on the volume can be pointed at from more than one place. Importing a
// trade into a note copies the trade's chart URL into a note image row: two
// rows, one file. So whoever deletes one of those rows cannot know whether the
// file is still needed — only the rows left behind can say.
//
// Hence the rule below: rows first, file second, and the file goes only when
// nothing references it any more.

/**
 * Unlinks the file behind `url`, unless a trade chart or a note image still
 * points at it.
 *
 * **Call this after deleting the rows that referenced the file**, never before:
 * the check counts what is left, so a row deleted afterwards would keep the
 * file alive forever, and a row still present when the check runs is exactly
 * what should stop the unlink.
 *
 * A file left behind costs disk. A file removed too early costs a broken image
 * in a note the user never touched, and the bytes are gone.
 */
export async function deleteImageFileIfUnused(url: string | null | undefined) {
  if (!url) return;
  const filename = url.split("/").pop();
  if (!filename) return;

  const usedByNote = await prisma.noteExampleImage.count({ where: { url } });
  if (usedByNote > 0) return;

  const usedByTrade = await prisma.trade.count({
    where: { OR: CHART_SLOTS.map((slot) => ({ [slot.field]: url })) },
  });
  if (usedByTrade > 0) return;

  await unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
  // The derivatives go with it. A thumbnail whose source is gone is a file
  // nothing can reach any more, and it would never be swept by anything else.
  await deleteThumbnails(filename);
}

/** Same rule, for a batch — the same URL twice only gets looked at once. */
export async function deleteImageFilesIfUnused(urls: (string | null | undefined)[]) {
  for (const url of new Set(urls)) await deleteImageFileIfUnused(url);
}
