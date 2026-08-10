// The upload route decides what a file is by reading its first bytes, not by
// trusting what the browser said it was. Both `file.type` and `file.name` come
// from the request, so either can claim `image/png` for anything at all; the
// signature below is the only part of the upload the sender cannot fake.
//
// The four types here are exactly the ones the serving route knows how to hand
// back with a real Content-Type. Anything else would be stored only to be
// served as `application/octet-stream` later, so it is refused up front.
//
// SVG is deliberately absent: it is a document, it can carry script, and it
// would be served from our own origin.

export type ImageType = { mime: string; ext: string };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38]; // "GIF8", covering 87a and 89a

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/** The image type `bytes` actually is, or null when it is not an image we serve. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, PNG)) return { mime: "image/png", ext: ".png" };
  if (startsWith(bytes, JPEG)) return { mime: "image/jpeg", ext: ".jpg" };
  if (startsWith(bytes, GIF)) return { mime: "image/gif", ext: ".gif" };

  // WebP is a RIFF container: "RIFF" then a four-byte length, then "WEBP".
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return { mime: "image/webp", ext: ".webp" };
  }

  return null;
}
