// Our Railway deployment stalls on request bodies of roughly 1MB or more: the
// request reaches the app but no response is ever sent, so the upload hangs
// forever instead of failing. Measured on the deployed app, 900KB answers in
// 0.48s and 1000KB never answers. Chart screenshots are well past that as PNG,
// so we re-encode them to WebP in the browser before they are sent.

const MAX_DIMENSION = 2560;
const QUALITIES = [0.92, 0.85, 0.75, 0.65, 0.5];
const SHRINK_STEPS = 4;

// Guards against handing a huge file to createImageBitmap, which decodes it
// uncompressed in memory and can lock up the tab.
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Re-encodes `file` as WebP until it fits in `maxBytes`, lowering quality first
 * and then halving the dimensions. Returns the original file untouched if it
 * already fits, and also if it cannot be re-encoded — callers are expected to
 * check the size of what they get back.
 */
export async function compressImage(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;

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
