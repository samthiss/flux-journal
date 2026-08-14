import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/lib/uploadDir";

export type ImageSize = { width: number; height: number } | null;

/**
 * The pixel dimensions of an encoded image, or null when they cannot be read.
 *
 * Null is a normal answer, not a failure to report: it is what a tile falls back
 * to when nothing is known about the image, and it is better than a guess, which
 * would reserve the wrong height and shift the page anyway.
 */
export async function measureImage(buffer: Buffer): Promise<ImageSize> {
  try {
    // sharp reads the header only — it does not decode the pixels.
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * The dimensions of an image already stored on the uploads volume, addressed by
 * the URL held in the database.
 *
 * Anything that is not one of our own uploads — the charts still served by
 * base44 — returns null rather than being fetched: a remote round trip per row
 * is not worth a reserved height, and those images are on their way out anyway.
 */
export async function measureStoredImage(url: string): Promise<ImageSize> {
  const prefix = "/api/uploads/";
  if (!url.startsWith(prefix)) return null;

  // The name comes out of the database, but it arrived there from a request, so
  // it is treated as untrusted: only a bare filename may be read, never a path
  // that climbs out of the uploads directory.
  const filename = url.slice(prefix.length).split("?")[0];
  if (!filename || filename !== path.basename(filename)) return null;

  try {
    return await measureImage(await readFile(path.join(UPLOAD_DIR, filename)));
  } catch {
    return null;
  }
}
