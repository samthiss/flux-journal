import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/lib/uploadDir";

// next/image cannot help here. Its optimizer fetches the source over HTTP and
// deliberately forwards no headers, so behind the session proxy it gets a 401
// and answers "the requested resource isn't a valid image" — which is exactly
// what broke every note thumbnail the day the password went up.
//
// So the resizing happens here instead, inside the route that already serves
// the file. That request comes from the browser, carries the session cookie
// like any other, and stays as protected as the original.

/**
 * Derivatives live beside the uploads rather than inside them.
 *
 * backup-prod.sh copies the whole uploads directory to the backup repository,
 * and a thumbnail is re-creatable from the file next to it — committing both
 * would grow a repository that already struggles to push at all.
 */
const CACHE_DIR = path.join(UPLOAD_DIR, "..", "uploads-cache");

/**
 * The widths a thumbnail may be built at.
 *
 * Anything else is snapped to the nearest one above. Without a fixed set, every
 * distinct `?w=` would write another file, and a browser window dragged across
 * the screen would be enough to fill the volume.
 */
const WIDTHS = [640, 828, 1080, 1200, 1920, 2560, 3200] as const;

export function snapWidth(requested: number) {
  return WIDTHS.find((w) => w >= requested) ?? WIDTHS[WIDTHS.length - 1];
}

function cacheName(filename: string, width: number) {
  return `${filename}-w${width}.webp`;
}

/**
 * A WebP of `filename` at `width`, built once and read from disk afterwards.
 *
 * Returns null when the source cannot be read or is not an image sharp
 * understands, so the caller can fall back to serving the original rather than
 * turning a working image into an error.
 */
export async function thumbnail(filename: string, width: number): Promise<Buffer | null> {
  const target = path.join(CACHE_DIR, cacheName(filename, width));

  try {
    return await readFile(target);
  } catch {
    // Not built yet — fall through and build it.
  }

  try {
    const source = await readFile(path.join(UPLOAD_DIR, filename));
    const shrinking = ((await sharp(source).metadata()).width ?? 0) > width;

    // Lossy encoding only pays for itself when there is detail to throw away.
    //
    // Measured over 30 stored captures: when the source is already narrower
    // than the requested width nothing is resampled, and lossless comes out at
    // 85KB against 81KB for quality 82 — the same bytes for an exact copy, so
    // the loss was buying nothing. That is the common case at one image per
    // row, where two thirds of the corpus is narrower than the tile.
    //
    // Once the image is actually reduced the picture inverts: resampling turns
    // flat chart colours into gradients and lossless jumps to 177KB against
    // 75KB. So that path stays lossy, at 90 rather than 82 — 65KB against
    // 51KB, spent on the thin lines and small text a downscale hurts most.
    const out = await sharp(source)
      // withoutEnlargement: a 400px screenshot asked for at 1080 stays 400px
      // wide rather than being blown up into a blurrier version of itself.
      .resize({ width, withoutEnlargement: true })
      .webp(shrinking ? { quality: 90 } : { lossless: true })
      .toBuffer();

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(target, out);
    return out;
  } catch {
    return null;
  }
}

/**
 * Drops every derivative of `filename`.
 *
 * Called wherever the original is unlinked: a thumbnail outliving its source is
 * a file nothing can ever reach again, which is the leak the delete paths were
 * fixed to stop producing.
 */
export async function deleteThumbnails(filename: string) {
  const prefix = `${filename}-w`;
  try {
    const entries = await readdir(CACHE_DIR);
    await Promise.all(
      entries
        .filter((e) => e.startsWith(prefix))
        .map((e) => unlink(path.join(CACHE_DIR, e)).catch(() => {}))
    );
  } catch {
    // No cache directory yet, or unreadable: nothing to drop either way.
  }
}
