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

  // The same route serves the note examples and the trade ideas: the file
  // handling is identical, only the row it is recorded on differs.
  const exampleId = formData.get("exampleId");
  const ideaId = formData.get("ideaId");
  const file = formData.get("image");

  const target =
    typeof exampleId === "string" && exampleId
      ? ({ kind: "example", id: exampleId } as const)
      : typeof ideaId === "string" && ideaId
        ? ({ kind: "idea", id: ideaId } as const)
        : null;
  if (!target) {
    return Response.json({ error: "exampleId ou ideaId manquant." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Aucune image reçue." }, { status: 400 });
  }

  const owner =
    target.kind === "example"
      ? await prisma.noteExample.findUnique({ where: { id: target.id } })
      : await prisma.tradeIdea.findUnique({ where: { id: target.id } });
  if (!owner) {
    return Response.json(
      { error: target.kind === "example" ? "Exemple introuvable." : "Idée introuvable." },
      { status: 404 }
    );
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
    const size = await measureImage(buffer);

    if (target.kind === "idea") {
      // An idea's images live in a column, so the new one is appended to what
      // is already there rather than inserted as a row of its own.
      const idea = owner as { images: string | null };
      let images: unknown[] = [];
      try {
        const parsed = JSON.parse(idea.images ?? "[]");
        if (Array.isArray(parsed)) images = parsed;
      } catch {
        images = [];
      }
      const image = { url, width: size?.width ?? null, height: size?.height ?? null };
      await prisma.tradeIdea.update({
        where: { id: target.id },
        data: { images: JSON.stringify([...images, image]) },
      });
      revalidatePath("/checklist");
      return Response.json({ image });
    }

    const exampleId = target.id;
    const count = await prisma.noteExampleImage.count({ where: { exampleId } });
    // The size was measured above, while the bytes were already in hand, so the
    // tile can reserve its height the first time the page draws it. Unreadable
    // dimensions are stored as null and cost nothing but the old behaviour.
    //
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
