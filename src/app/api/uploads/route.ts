import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}${path.extname(file.name) || ".png"}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    const url = `/api/uploads/${filename}`;
    const count = await prisma.noteExampleImage.count({ where: { exampleId } });
    // The caller inserts this straight into its list, so it needs the whole
    // record — the id above all, without which it could not later remove the
    // image or edit its caption.
    const image = await prisma.noteExampleImage.create({ data: { exampleId, url, order: count } });

    revalidatePath("/notes");
    return Response.json({ image });
  } catch {
    return Response.json({ error: "Enregistrement de l'image impossible." }, { status: 500 });
  }
}
