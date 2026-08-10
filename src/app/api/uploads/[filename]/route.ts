import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/uploadDir";
import { snapWidth, thumbnail } from "@/lib/thumbnails";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(req: Request, ctx: { params: Promise<{ filename: string }> }) {
  const { filename } = await ctx.params;

  if (filename.includes("/") || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  // `?w=` asks for a thumbnail. A screenshot is stored at capture resolution —
  // 1600 to 3200px wide — and a grid tile is a few hundred, so serving the
  // original there costs megabytes per note for pixels no one sees. Without the
  // parameter the file comes back untouched, which is what the full-size view
  // and every existing link rely on.
  const requested = Number(new URL(req.url).searchParams.get("w"));
  if (Number.isFinite(requested) && requested > 0) {
    const data = await thumbnail(filename, snapWidth(requested));
    if (data) {
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    // Unreadable, or a format sharp will not take: fall through and serve the
    // original rather than turn a working image into an error.
  }

  try {
    const data = await readFile(path.join(UPLOAD_DIR, filename));
    const ext = path.extname(filename).toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
