"use client";

import { useEffect, useState } from "react";
import { getNoteTreeWithCategories, moveCategory } from "@/lib/actions/notes";

type NoteRow = { id: string; title: string; parentId: string | null; order: number };
type TreeNode = NoteRow & { children: TreeNode[] };

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

/**
 * Moves a whole category to another note.
 *
 * One step, not two: a category is not moved *into* another category, so the
 * destination is simply a note — which is why this is its own menu rather than
 * MoveExampleMenu with a flag. The note it already sits in is listed but not
 * selectable, so the choice reads as a map of where it could go.
 */
export default function MoveCategoryMenu({
  categoryId,
  currentNoteId,
  visible,
  onMoved,
}: {
  categoryId: string;
  currentNoteId: string;
  visible: boolean;
  onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || notes.length > 0) return;
    getNoteTreeWithCategories().then(({ notes }) => {
      setNotes(notes);
      setLoading(false);
    });
  }, [open, notes.length]);

  const rows = flattenDFS(buildTree(notes)).filter(({ node }) =>
    node.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ position: "relative", flex: "none", opacity: visible || open ? 1 : 0, transition: "opacity 0.12s ease" }}>
      <span
        onClick={() => setOpen((o) => !o)}
        title="Déplacer la catégorie dans une autre note"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 10,
          padding: "3px 10px",
          borderRadius: 999,
          border: "1px dashed oklch(0.34 0.02 250)",
          color: "oklch(0.6 0.02 250)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⇄ déplacer
      </span>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute",
            top: "130%",
            left: 0,
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
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une note..."
            style={{
              width: "100%",
              fontSize: 12.5,
              padding: "7px 9px",
              borderRadius: 7,
              border: "1px solid oklch(0.32 0.034 250)",
              background: "oklch(0.16 0.03 250)",
              color: "oklch(0.9 0.0085 250)",
              outline: "none",
              marginBottom: 6,
              boxSizing: "border-box",
            }}
          />
          {loading && <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", padding: "6px 4px" }}>Chargement...</div>}
          {!loading && rows.length === 0 && (
            <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", padding: "6px 4px" }}>Aucune note.</div>
          )}
          {!loading &&
            rows.map(({ node, depth }) => {
              const here = node.id === currentNoteId;
              return (
                <div
                  key={node.id}
                  onClick={async () => {
                    if (here) return;
                    setOpen(false);
                    await moveCategory(categoryId, node.id);
                    onMoved();
                  }}
                  style={{
                    fontSize: 12.5,
                    padding: `7px 8px 7px ${8 + depth * 14}px`,
                    borderRadius: 6,
                    cursor: here ? "default" : "pointer",
                    color: here ? "oklch(0.45 0.03 250)" : "oklch(0.85 0.017 250)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {node.title}
                  {here && <span style={{ fontSize: 11 }}> · ici</span>}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
