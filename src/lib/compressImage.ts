// Chart screenshots are re-encoded to WebP in the browser before upload, for
// two reasons.
//
// Size: measured over the 238 images already stored, WebP saves ~41% versus the
// PNG the OS screenshot tool produces. That is paid once at upload and saved on
// every note view afterwards.
//
// Ceiling: uploads of roughly 1MB or more have been seen to hang — the request
// reaches the app but no response is ever sent. Measured 900KB answering in
// 0.48s and 1000KB never answering. This was first attributed to Railway, but
// the same threshold was later reproduced pushing to an unrelated host from the
// same machine, which points at the local network path (an MTU black hole)
// rather than the deployment. Keeping uploads under the ceiling costs nothing,
// so the cap stays regardless of the cause.

const MAX_DIMENSION = 2560;
const QUALITIES = [0.92, 0.85, 0.75, 0.65, 0.5];
const SHRINK_STEPS = 4;

// Guards against handing a huge file to createImageBitmap, which decodes it
// uncompressed in memory and can lock up the tab.
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Re-encodes `file` as WebP, lowering quality first and then the dimensions
 * until the result fits in `maxBytes`. Every image goes through this, not only
 * the oversized ones: a 250KB PNG screenshot still shrinks by roughly a third,
 * and it is stored and re-downloaded far more often than it is uploaded.
 *
 * Returns the original file untouched when re-encoding would not help — it is
 * already WebP, the encode failed, or the result came out no smaller. Callers
 * are expected to check the size of what they get back.
 */
export async function compressImage(file: File, maxBytes: number): Promise<File> {
  // Re-encoding WebP as WebP only sheds quality for no gain.
  if (file.type === "image/webp" && file.size <= maxBytes) return file;

  const bitmap = await createImageBitmap(file);
  try {
    let width = Math.min(bitmap.width, MAX_DIMENSION);

    for (let step = 0; step < SHRINK_STEPS; step++) {
      const scale = width / bitmap.width;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality)
        );
        if (!blob) return file;
        if (blob.size <= maxBytes) {
          // Some images (already-optimised ones, mostly) encode larger as WebP.
          // Only swap when it is actually a win and the original was sendable.
          if (blob.size >= file.size && file.size <= maxBytes) return file;
          const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
          return new File([blob], name, { type: "image/webp" });
        }
      }

      width = Math.round(width * 0.75);
    }

    return file;
  } finally {
    bitmap.close();
  }
}
