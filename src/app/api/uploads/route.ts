import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { measureImage } from "@/lib/imageSize";
import { sniffImageType } from "@/lib/imageType";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadDir";

// Image uploads go through this route rather than a Server Action on purpose.
// On our Railway deployment, Server Action requests above roughly 0.7MB never
// come back at all — the request reaches the app but no response is ever sent,
// so the caller hangs forever. Route Handlers are not subject to
// serverActions.bodySizeLimit and return normally at the same sizes.

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  const exampleId = formData.get("exampleId");
  const file = formData.get("image");

  if (typeof exampleId !== "string" || !exampleId) {
    return Response.json({ error: "exampleId manquant." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Aucune image reçue." }, { status: 400 });
  }

  const example = await prisma.noteExample.findUnique({ where: { id: exampleId } });
  if (!example) {
    return Response.json({ error: "Exemple introuvable." }, { status: 404 });
  }

  try {
    // What the file says it is cannot be trusted: `file.type` and the extension
    // in `file.name` both come from the request, so either can claim to be a
    // PNG. The first bytes cannot be dressed up that way, so they decide both
    // whether we keep the file and the extension it is stored under — that
    // extension is what the serving route turns back into a Content-Type.
    const buffer = Buffer.from(await file.arrayBuffer());
    const type = sniffImageType(buffer);
    if (!type) {
      return Response.json(
        { error: "Ce fichier n'est pas une image PNG, JPEG, WebP ou GIF." },
        { status: 415 }
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}${type.ext}`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    const url = `/api/uploads/${filename}`;
    const count = await prisma.noteExampleImage.count({ where: { exampleId } });
    // Measured here, while the bytes are already in hand, so the tile can
    // reserve its height the first time the page draws it. Unreadable
    // dimensions are stored as null and cost nothing but the old behaviour.
    const size = await measureImage(buffer);
    // The caller inserts this straight into its list, so it needs the whole
    // record — the id above all, without which it could not later remove the
    // image or edit its caption.
    const image = await prisma.noteExampleImage.create({
      data: { exampleId, url, order: count, width: size?.width ?? null, height: size?.height ?? null },
    });

    revalidatePath("/notes");
    return Response.json({ image });
  } catch {
    return Response.json({ error: "Enregistrement de l'image impossible." }, { status: 500 });
  }
}
