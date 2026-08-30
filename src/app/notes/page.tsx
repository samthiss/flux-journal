import { getNotesPageData } from "@/lib/actions/notes";
import NotesClient from "@/components/NotesClient";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const cookieStore = await cookies();
  const collapsedNotesCookie = cookieStore.get("collapsed-notes");
  let initialCollapsedNotes: string[] = [];
  if (collapsedNotesCookie?.value) {
    try {
      initialCollapsedNotes = JSON.parse(collapsedNotesCookie.value);
    } catch {}
  }

  const { notes, blocks, categories, examples, images, hiddenTagOptions } = await getNotesPageData();
  return (
    <NotesClient
      notes={notes}
      blocks={blocks}
      categories={categories}
      examples={examples}
      images={images}
      hiddenTagOptions={hiddenTagOptions}
      initialCollapsedNotes={initialCollapsedNotes}
    />
  );
}
