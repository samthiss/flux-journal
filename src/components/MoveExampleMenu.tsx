"use client";

import { useEffect, useState } from "react";
import { getNoteTreeWithCategories, moveExample, createCategoryNamed } from "@/lib/actions/notes";
import { accentColor } from "@/lib/theme";

type NoteRow = { id: string; title: string; parentId: string | null; order: number };
type TreeNode = NoteRow & { children: TreeNode[] };
type CategoryRow = { id: string; noteId: string; name: string };

function buildTree(flat: NoteRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  flat.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: TreeNode[] = [];
  flat.forEach((n) => {
    const node = map.get(n.id)!;
    if (n.parentId && map.has(n.parentId)) map.get(n.parentId)!.children.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function flattenDFS(nodes: TreeNode[], depth = 0, out: Array<{ node: TreeNode; depth: number }> = []) {
  for (const n of nodes) {
    out.push({ node: n, depth });
    flattenDFS(n.children, depth + 1, out);
  }
  return out;
}

const rowStyle = { fontSize: 12.5, padding: "7px 8px", borderRadius: 6, cursor: "pointer", color: "oklch(0.85 0.017 250)" } as const;

// Two steps, note then category, for the same reason AddTradeToNoteButton uses
// them: a flat list of every category across every note reads as noise once the
// tree has more than a handful of nodes.
export default function MoveExampleMenu({
  exampleId,
  currentNoteId,
  currentCategoryId,
  visible,
  onMoved,
}: {
  exampleId: string;
  currentNoteId: string;
  currentCategoryId: string | null;
  visible: boolean;
  onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!open || notes.length > 0) return;
    getNoteTreeWithCategories().then(({ notes, categories }) => {
      setNotes(notes);
      setCategories(categories);
      setLoading(false);
    });
  }, [open, notes.length]);

  function close() {
    setOpen(false);
    setSelectedNoteId(null);
    setQuery("");
    setCreatingCategory(false);
    setNewCategoryName("");
  }

  const rows = flattenDFS(buildTree(notes)).filter(({ node }) => node.title.toLowerCase().includes(query.toLowerCase()));
  const noteCategories = selectedNoteId ? categories.filter((c) => c.noteId === selectedNoteId) : [];
  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  async function handlePick(categoryId: string | null) {
    if (!selectedNoteId || moving) return;
    // Where it already is: nothing to do, and saying so beats a no-op that looks
    // like a failed click.
    if (selectedNoteId === currentNoteId && categoryId === currentCategoryId) {
      close();
      return;
    }
    setMoving(true);
    await moveExample(exampleId, selectedNoteId, categoryId);
    setMoving(false);
    close();
    onMoved();
  }

  async function handleCreateCategory() {
    if (!selectedNoteId) return;
    const name = newCategoryName.trim();
    if (!name) {
      setCreatingCategory(false);
      return;
    }
    const category = await createCategoryNamed(selectedNoteId, name);
    setCategories((prev) => [...prev, { id: category.id, noteId: selectedNoteId, name: category.name }]);
    setCreatingCategory(false);
    setNewCategoryName("");
    await handlePick(category.id);
  }

  return (
    <div
      style={{ position: "relative", flex: "none", opacity: visible || open ? 1 : 0, transition: "opacity 0.12s ease" }}
      onMouseLeave={() => !creatingCategory && setOpen(false)}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Déplacer cet exemple"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 10,
          padding: "3px 10px",
          borderRadius: 999,
          border: "1px dashed oklch(0.34 0.034 250)",
          color: "oklch(0.6 0.034 250)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⇄ déplacer
      </span>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            zIndex: 40,
            width: 280,
            maxHeight: 340,
            overflowY: "auto",
            background: "oklch(0.21 0.034 250)",
            border: "1px solid oklch(0.34 0.034 250)",
            borderRadius: 10,
            boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
            padding: 8,
          }}
        >
          {!selectedNoteId ? (
            <>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher une note..."
                style={{ width: "100%", fontSize: 12.5, padding: "7px 9px", borderRadius: 7, border: "1px solid oklch(0.32 0.034 250)", background: "oklch(0.16 0.034 250)", color: "oklch(0.9 0.0085 250)", outline: "none", marginBottom: 6, boxSizing: "border-box" }}
              />
              {loading && <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", padding: "6px 4px" }}>Chargement...</div>}
              {!loading && rows.length === 0 && <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", padding: "6px 4px" }}>Aucune note.</div>}
              {!loading &&
                rows.map(({ node, depth }) => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNoteId(node.id)}
                    style={{
                      ...rowStyle,
                      paddingLeft: 8 + depth * 14,
                      color: node.id === currentNoteId ? accentColor : rowStyle.color,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {node.title}
                  </div>
                ))}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "2px 4px" }}>
                <span onClick={() => setSelectedNoteId(null)} style={{ cursor: "pointer", fontSize: 12, color: "oklch(0.6 0.034 250)" }}>
                  ‹
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.9 0.0085 250)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedNote?.title}
                </span>
              </div>
              {noteCategories.map((c) => {
                const here = selectedNoteId === currentNoteId && c.id === currentCategoryId;
                return (
                  <div key={c.id} onClick={() => handlePick(c.id)} style={{ ...rowStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    {here && <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 9.5, color: "oklch(0.5 0.034 250)" }}>ici</span>}
                  </div>
                );
              })}
              <div onClick={() => handlePick(null)} style={{ ...rowStyle, color: "oklch(0.6 0.034 250)" }}>
                Sans catégorie
              </div>
              <div style={{ borderTop: "1px solid oklch(0.3 0.034 250)", margin: "6px 0" }} />
              {creatingCategory ? (
                <input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onBlur={handleCreateCategory}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setNewCategoryName("");
                      setCreatingCategory(false);
                    }
                  }}
                  placeholder="Nom de la catégorie"
                  style={{ width: "100%", fontSize: 12.5, padding: "7px 8px", borderRadius: 6, border: `1px solid ${accentColor}`, background: "oklch(0.84 0.17 196 / 0.1)", color: "oklch(0.9 0.017 250)", outline: "none", boxSizing: "border-box" }}
                />
              ) : (
                <div onClick={() => setCreatingCategory(true)} style={{ ...rowStyle, color: accentColor, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14 }}>+</span> Nouvelle catégorie
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
