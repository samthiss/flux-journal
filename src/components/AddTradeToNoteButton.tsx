"use client";

import { useEffect, useState } from "react";
import { getNoteTreeWithCategories, addTradeExampleToNote, createCategoryNamed } from "@/lib/actions/notes";
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

export default function AddTradeToNoteButton({ tradeId }: { tradeId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    if (!open || notes.length > 0) return;
    getNoteTreeWithCategories().then(({ notes, categories }) => {
      setNotes(notes);
      setCategories(categories);
      setLoading(false);
    });
  }, [open, notes.length]);

  const rows = flattenDFS(buildTree(notes)).filter(({ node }) => node.title.toLowerCase().includes(query.toLowerCase()));
  const noteCategories = selectedNoteId ? categories.filter((c) => c.noteId === selectedNoteId) : [];
  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  async function handlePick(categoryId: string | null) {
    if (!selectedNoteId) return;
    await addTradeExampleToNote(tradeId, selectedNoteId, categoryId, tags);
    setOpen(false);
    setSelectedNoteId(null);
    setQuery("");
    setCreatingCategory(false);
    setNewCategoryName("");
    setTags([]);
    setTagDraft("");
    setDone(true);
    setTimeout(() => setDone(false), 2500);
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
    await handlePick(category.id);
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          fontSize: 13,
          fontWeight: 600,
          padding: "11px 18px",
          borderRadius: 9,
          border: "1px solid oklch(0.36 0.051 250 / 0.6)",
          background: done ? "oklch(0.84 0.17 196 / 0.16)" : "oklch(0.18 0.034 250)",
          color: done ? accentColor : "oklch(0.85 0.017 250)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> {done ? "Ajouté ✓" : "Add"}
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            zIndex: 40,
            width: 300,
            maxHeight: 360,
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
                      fontSize: 12.5,
                      padding: `7px 8px 7px ${8 + depth * 14}px`,
                      borderRadius: 6,
                      cursor: "pointer",
                      color: "oklch(0.85 0.017 250)",
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
                <span
                  onClick={() => {
                    setSelectedNoteId(null);
                    setCreatingCategory(false);
                    setNewCategoryName("");
                    setTags([]);
                    setTagDraft("");
                  }}
                  style={{ cursor: "pointer", fontSize: 12, color: "oklch(0.6 0.034 250)" }}
                >
                  ‹
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.9 0.0085 250)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedNote?.title}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "0 4px 8px" }}>
                {tags.map((t, ti) => (
                  <span
                    key={ti}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 5px 3px 9px", borderRadius: 999, background: "oklch(0.28 0.034 250)", color: "oklch(0.75 0.034 250)" }}
                  >
                    {t}
                    <span onClick={() => setTags(tags.filter((_, xi) => xi !== ti))} style={{ cursor: "pointer", fontSize: 12, opacity: 0.7 }}>
                      ✕
                    </span>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = tagDraft.trim();
                      if (v) setTags((prev) => [...prev, v]);
                      setTagDraft("");
                    }
                  }}
                  placeholder="+ tag"
                  style={{ width: 70, fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 8px", borderRadius: 999, border: "1px dashed oklch(0.34 0.034 250)", background: "transparent", color: "oklch(0.8 0.034 250)", outline: "none" }}
                />
              </div>
              {noteCategories.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handlePick(c.id)}
                  style={{ fontSize: 12.5, padding: "7px 8px", borderRadius: 6, cursor: "pointer", color: "oklch(0.85 0.017 250)" }}
                >
                  {c.name}
                </div>
              ))}
              <div
                onClick={() => handlePick(null)}
                style={{ fontSize: 12.5, padding: "7px 8px", borderRadius: 6, cursor: "pointer", color: "oklch(0.6 0.034 250)" }}
              >
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
                <div
                  onClick={() => setCreatingCategory(true)}
                  style={{ fontSize: 12.5, padding: "7px 8px", borderRadius: 6, cursor: "pointer", color: accentColor, display: "flex", alignItems: "center", gap: 5 }}
                >
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
