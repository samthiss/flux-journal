import { getNotesPageData } from "@/lib/actions/notes";
import NotesClient from "@/components/NotesClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const { notes, blocks, categories, examples, images } = await getNotesPageData();
  return <NotesClient notes={notes} blocks={blocks} categories={categories} examples={examples} images={images} />;
}
