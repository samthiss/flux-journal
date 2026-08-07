"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { accentColor } from "@/lib/theme";
import {
  renameNote,
  deleteNote,
  createNoteBlock,
  createExemplesBlock,
  updateNoteBlockContent,
  deleteNoteBlock,
  reorderNoteBlocks,
  createCategoryNamed,
  renameCategory,
  deleteCategory,
  createExample,
  updateExample,
  deleteExample,
  addExampleImage,
  addExampleImageByUrl,
  removeExampleImage,
  searchTrades,
  importTradeImages,
} from "@/lib/actions/notes";

const lossColor = "oklch(0.65 0.18 25)";
const TEXT_WIDTH = 1040;
const HEADER_INDENT = 75;

type NoteRecord = {
  id: string;
  parentId: string | null;
  title: string;
  order: number;
};

type BlockRecord = { id: string; noteId: string; type: string; content: string | null; order: number };

const BLOCK_TYPE_LABELS: Record<string, string> = {
  headings: "Titre",
  objectif: "Encadré",
  theorie: "Texte",
  regles: "Liste numérotée",
  retenir: "Liste à puces",
  invalide: "Invalid",
  exemples: "Exemples",
};

type CategoryRecord = { id: string; noteId: string; name: string; order: number };
type ExampleRecord = { id: string; noteId: string; categoryId: string | null; title: string; caption: string | null; tags: string | null; order: number };
type ImageRecord = { id: string; exampleId: string; url: string; tradeId: string | null; order: number };
type TradeSearchResult = { id: string; symbol: string; date: string; setup: string; side: string; pnl: number; imageCount: number };

function parseArr(s: string | null): string[] {
  if (!s) return [];
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

type RegleItem = { title: string; details: string[] };

function parseRegles(s: string | null): RegleItem[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => {
      if (typeof x === "string") return { title: x, details: [] };
      if (Array.isArray(x?.details)) return { title: x?.title ?? "", details: x.details };
      if (typeof x?.detail === "string" && x.detail) return { title: x?.title ?? "", details: [x.detail] };
      return { title: x?.title ?? "", details: [] };
    });
  } catch {
    return [];
  }
}

function tagStyle(tag: string) {
  const t = tag.toUpperCase();
  if (t === "VALIDE") return { bg: "oklch(0.68 0.19 293 / 0.18)", color: accentColor };
  if (t === "INVALIDE") return { bg: "oklch(0.65 0.18 25 / 0.18)", color: lossColor };
  return { bg: "oklch(0.28 0.02 290)", color: "oklch(0.72 0.02 290)" };
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function handleListKeyDown(
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  i: number,
  arr: string[],
  onUpdate: (next: string[]) => void,
  refs: React.MutableRefObject<(HTMLInputElement | HTMLTextAreaElement | null)[]>,
  opts: { allowEnter?: boolean } = {}
) {
  if (opts.allowEnter && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const next = [...arr.slice(0, i + 1), "", ...arr.slice(i + 1)];
    onUpdate(next);
    requestAnimationFrame(() => refs.current[i + 1]?.focus());
    return;
  }
  if ((e.key === "Backspace" || e.key === "Delete") && arr[i] === "" && arr.length > 1) {
    e.preventDefault();
    const next = arr.filter((_, xi) => xi !== i);
    onUpdate(next);
    const focusIdx = Math.max(0, i - 1);
    requestAnimationFrame(() => {
      const el = refs.current[focusIdx];
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5l.6 8.4a1 1 0 0 0 1 .93h3.8a1 1 0 0 0 1-.93l.6-8.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.7 6.2v4M8.3 6.2v4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ color, down }: { color: string; down: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" style={{ transform: down ? "rotate(90deg)" : "none", transition: "transform 0.12s ease", flex: "none" }}>
      <path d="M3.5 1.5L7 5l-3.5 3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="11" height="15" viewBox="0 0 11 15" fill="currentColor">
      <circle cx="2.5" cy="2" r="1.3" />
      <circle cx="8" cy="2" r="1.3" />
      <circle cx="2.5" cy="7.5" r="1.3" />
      <circle cx="8" cy="7.5" r="1.3" />
      <circle cx="2.5" cy="13" r="1.3" />
      <circle cx="8" cy="13" r="1.3" />
    </svg>
  );
}

function GripMenuButton({ onDelete, onDragStart, visible }: { onDelete: () => void; onDragStart?: (e: React.MouseEvent) => void; visible: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", opacity: visible || open ? 1 : 0, transition: "opacity 0.12s ease" }} onMouseLeave={() => setOpen(false)}>
      <span
        onMouseDown={onDragStart}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={onDragStart ? "Glisser pour réorganiser · cliquer pour les options" : "Options"}
        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.5 0.02 290)", borderRadius: 5, cursor: onDragStart ? "grab" : "pointer" }}
      >
        <GripIcon />
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "110%",
            zIndex: 30,
            background: "oklch(0.21 0.02 290)",
            border: "1px solid oklch(0.34 0.02 290)",
            borderRadius: 8,
            boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
            padding: 4,
            minWidth: 140,
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", fontSize: 13, color: lossColor, borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <TrashIcon /> Supprimer
          </span>
        </div>
      )}
    </div>
  );
}

function PlusGripCluster({
  onPlus,
  onDelete,
  plusTitle,
  visible,
}: {
  onPlus: () => void | Promise<void>;
  onDelete?: () => void;
  plusTitle: string;
  visible: boolean;
}) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1, flex: "none" }}>
      <span
        onClick={async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusy(true);
          try {
            await onPlus();
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        }}
        title={plusTitle}
        style={{
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: "oklch(0.5 0.02 290)",
          borderRadius: 5,
          cursor: busy ? "default" : "pointer",
          pointerEvents: busy ? "none" : "auto",
          opacity: busy ? 0.4 : visible ? 1 : 0,
          transition: "opacity 0.12s ease",
        }}
      >
        +
      </span>
      {onDelete && <GripMenuButton visible={visible} onDelete={onDelete} />}
    </div>
  );
}

function MoreMenuButton({ onDelete, visible }: { onDelete: () => void; visible: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: "relative", flex: "none", opacity: visible || open ? 1 : 0, transition: "opacity 0.12s ease" }}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Plus d'options"
        style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, letterSpacing: "-1px", color: "oklch(0.55 0.02 290)", borderRadius: 6, cursor: "pointer" }}
      >
        ⋯
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            zIndex: 30,
            background: "oklch(0.21 0.02 290)",
            border: "1px solid oklch(0.34 0.02 290)",
            borderRadius: 8,
            boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
            padding: 4,
            minWidth: 150,
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", fontSize: 13, color: lossColor, borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <TrashIcon /> Supprimer
          </span>
        </div>
      )}
    </div>
  );
}

type TreeNode = NoteRecord & { children: TreeNode[] };

function buildTree(flat: NoteRecord[]): TreeNode[] {
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

export default function NotesClient({
  notes,
  blocks,
  categories,
  examples,
  images,
}: {
  notes: NoteRecord[];
  blocks: BlockRecord[];
  categories: CategoryRecord[];
  examples: ExampleRecord[];
  images: ImageRecord[];
}) {
  const router = useRouter();
  const treeNodes = useMemo(() => buildTree(notes), [notes]);
  const flat = useMemo(() => flattenDFS(treeNodes), [treeNodes]);

  return (
    <div>
      <div>
        {flat.map(({ node }) => (
          <NoteSection
            key={node.id}
            note={node}
            blocks={blocks.filter((b) => b.noteId === node.id)}
            categories={categories.filter((c) => c.noteId === node.id)}
            examples={examples.filter((e) => e.noteId === node.id)}
            images={images}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function NoteSection({
  note,
  blocks,
  categories,
  examples,
  images,
  onChanged,
}: {
  note: NoteRecord;
  blocks: BlockRecord[];
  categories: CategoryRecord[];
  examples: ExampleRecord[];
  images: ImageRecord[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [blockList, setBlockList] = useState<BlockRecord[]>(() => [...blocks].sort((a, b) => a.order - b.order));
  const blockListRef = useRef(blockList);
  useEffect(() => {
    blockListRef.current = blockList;
  }, [blockList]);

  const [headerHover, setHeaderHover] = useState(false);
  const [exemplesHover, setExemplesHover] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "tag">("date");
  const [addLineText, setAddLineText] = useState("");
  const [addLineHover, setAddLineHover] = useState(false);
  const [addLineFocused, setAddLineFocused] = useState(false);
  const addLineInputRef = useRef<HTMLInputElement | null>(null);

  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draggingIdRef = useRef<string | null>(null);
  const [blockHover, setBlockHover] = useState<string | null>(null);

  function startBlockDrag(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      draggingIdRef.current = id;
      function onMove(ev: MouseEvent) {
        const dragId = draggingIdRef.current;
        if (!dragId) return;
        const list = blockListRef.current;
        let closestId: string | null = null;
        let closestDist = Infinity;
        for (const b of list) {
          const el = blockRefs.current[b.id];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          const dist = Math.abs(ev.clientY - mid);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = b.id;
          }
        }
        if (closestId && closestId !== dragId) {
          const dragItem = list.find((b) => b.id === dragId);
          if (!dragItem) return;
          const next = list.filter((b) => b.id !== dragId);
          const targetIdx = next.findIndex((b) => b.id === closestId);
          next.splice(targetIdx, 0, dragItem);
          blockListRef.current = next;
          setBlockList(next);
        }
      }
      function onUp() {
        draggingIdRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        reorderNoteBlocks(blockListRef.current.map((b) => b.id));
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
  }

  async function addBlock(type: string) {
    if (type === "exemples") {
      const created = await createExemplesBlock(note.id);
      setBlockList((prev) => [...prev, { id: created.id, noteId: note.id, type: "exemples", content: null, order: prev.length }]);
      onChanged();
      return;
    }
    const created = await createNoteBlock(note.id, type);
    setBlockList((prev) => [...prev, { id: created.id, noteId: note.id, type, content: created.content, order: prev.length }]);
  }

  async function deleteBlock(blockId: string) {
    setBlockList((prev) => prev.filter((b) => b.id !== blockId));
    await deleteNoteBlock(blockId);
    onChanged();
  }

  const allTags = useMemo(() => {
    const t = new Set<string>();
    examples.forEach((e) => parseArr(e.tags).forEach((tag) => t.add(tag)));
    return Array.from(t);
  }, [examples]);

  const byTagFilter = tagFilter.length === 0 ? examples : examples.filter((e) => parseArr(e.tags).some((t) => tagFilter.includes(t)));
  const filteredExamples =
    sortBy === "tag"
      ? [...byTagFilter].sort((a, b) => (parseArr(a.tags)[0] || "~~~").toLowerCase().localeCompare((parseArr(b.tags)[0] || "~~~").toLowerCase()))
      : byTagFilter;
  const uncategorized = filteredExamples.filter((e) => !e.categoryId || !categories.some((c) => c.id === e.categoryId));

  const hasExemples = blockList.some((b) => b.type === "exemples");

  return (
    <div data-note-section={note.id} id={"note-" + note.id} style={{ paddingBottom: 48, marginBottom: 40, borderBottom: "1px solid oklch(0.22 0.02 290)" }}>
      <div style={{ maxWidth: TEXT_WIDTH }}>
        <div
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
          style={{ display: "flex", alignItems: "center", marginBottom: 20 }}
        >
          <div style={{ width: HEADER_INDENT, flex: "none" }} />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => renameNote(note.id, title)}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "oklch(0.96 0.004 290)",
              padding: "2px 0",
            }}
          />
          <div style={{ marginLeft: 8 }}>
            <MoreMenuButton
              visible={headerHover}
              onDelete={async () => {
                await deleteNote(note.id);
                onChanged();
              }}
            />
          </div>
        </div>
      </div>

      {blockList.map((block) => {
        if (block.type === "exemples") {
          return (
            <DraggableBlock
              key={block.id}
              blockKey={block.id}
              setRef={(el) => { blockRefs.current[block.id] = el; }}
              hoverKey={blockHover}
              setHoverKey={setBlockHover}
              onDragStart={startBlockDrag(block.id)}
              onDelete={() => deleteBlock(block.id)}
            >
              <div>
                  <div
                    onMouseEnter={() => setExemplesHover(true)}
                    onMouseLeave={() => setExemplesHover(false)}
                    style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}
                  >
                    <PlusGripCluster
                      visible={exemplesHover}
                      plusTitle="Ajouter une catégorie"
                      onPlus={async () => {
                        const category = await createCategoryNamed(note.id, "Nouvelle catégorie");
                        await createExample(note.id, category.id);
                        onChanged();
                      }}
                    />
                    <span style={{ width: 10, flex: "none" }} />
                    <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.56 0.02 290)" }}>Exemples</span>
                    <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.48 0.02 290)" }}>Trier</span>
                    {([
                      { key: "date" as const, label: "Derniers ajoutés" },
                      { key: "tag" as const, label: "Nom de tag" },
                    ]).map((opt) => {
                      const on = sortBy === opt.key;
                      return (
                        <span
                          key={opt.key}
                          onClick={() => setSortBy(opt.key)}
                          style={{
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            fontSize: 10.5,
                            padding: "4px 10px",
                            borderRadius: 999,
                            cursor: "pointer",
                            border: `1px solid ${on ? accentColor : "oklch(0.3 0.02 290)"}`,
                            background: on ? "oklch(0.68 0.19 293 / 0.16)" : "oklch(0.2 0.02 290)",
                            color: on ? accentColor : "oklch(0.6 0.02 290)",
                          }}
                        >
                          {opt.label}
                        </span>
                      );
                    })}
                  </div>

                  {allTags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 20, marginLeft: HEADER_INDENT }}>
                      {allTags.map((t) => {
                        const st = tagStyle(t);
                        const on = tagFilter.includes(t);
                        return (
                          <div
                            key={t}
                            onClick={() => setTagFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]))}
                            style={{
                              fontFamily: "var(--font-jetbrains-mono), monospace",
                              fontSize: 11,
                              padding: "4px 11px",
                              borderRadius: 999,
                              cursor: "pointer",
                              border: `1px solid ${on ? st.color : "oklch(0.3 0.02 290)"}`,
                              background: on ? st.bg : "oklch(0.2 0.02 290)",
                              color: on ? st.color : "oklch(0.64 0.02 290)",
                            }}
                          >
                            {t}
                          </div>
                        );
                      })}
                      {tagFilter.length > 0 && (
                        <span onClick={() => setTagFilter([])} style={{ fontSize: 12, color: "oklch(0.58 0.02 290)", cursor: "pointer", padding: "4px 6px" }}>
                          réinitialiser
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    {categories.map((cat) => (
                      <ExampleCategory
                        key={cat.id}
                        title={cat.name}
                        onRename={(name) => {
                          renameCategory(cat.id, name);
                          onChanged();
                        }}
                        onDelete={async () => {
                          await deleteCategory(cat.id);
                          onChanged();
                        }}
                        onAddExample={async () => {
                          await createExample(note.id, cat.id);
                          onChanged();
                        }}
                        examples={filteredExamples.filter((e) => e.categoryId === cat.id)}
                        images={images}
                        onChanged={onChanged}
                      />
                    ))}
                    {(uncategorized.length > 0 || categories.length === 0) && (
                      <ExampleCategory
                        title="Sans catégorie"
                        onAddExample={async () => {
                          await createExample(note.id, null);
                          onChanged();
                        }}
                        onDelete={
                          uncategorized.length > 0
                            ? async () => {
                                for (const ex of uncategorized) await deleteExample(ex.id);
                                onChanged();
                              }
                            : undefined
                        }
                        examples={uncategorized}
                        images={images}
                        onChanged={onChanged}
                      />
                    )}
                  </div>
                </div>
            </DraggableBlock>
          );
        }
        return (
          <div key={block.id} style={{ maxWidth: TEXT_WIDTH }}>
            <DraggableBlock
              blockKey={block.id}
              setRef={(el) => { blockRefs.current[block.id] = el; }}
              hoverKey={blockHover}
              setHoverKey={setBlockHover}
              onDragStart={startBlockDrag(block.id)}
              onDelete={() => deleteBlock(block.id)}
            >
              <NoteBlockContent block={block} />
            </DraggableBlock>
          </div>
        );
      })}

      <div style={{ maxWidth: TEXT_WIDTH }}>
      {(() => {
        const availableBlocks = Object.entries(BLOCK_TYPE_LABELS)
          .map(([key, label]) => ({ key, label }))
          .filter((o) => o.key !== "exemples" || !hasExemples);

        const slashIndex = addLineText.lastIndexOf("/");
        const slashQuery = slashIndex >= 0 ? addLineText.slice(slashIndex + 1) : null;
        const filteredBlocks =
          slashQuery !== null ? availableBlocks.filter((o) => o.label.toLowerCase().includes(slashQuery.toLowerCase())) : [];
        const addLineActive = addLineHover || addLineFocused || addLineText.length > 0;

        async function selectBlock(key: string) {
          await addBlock(key);
          setAddLineText("");
          addLineInputRef.current?.focus();
        }

        return (
          <div
            onMouseEnter={() => setAddLineHover(true)}
            onMouseLeave={() => setAddLineHover(false)}
            style={{ position: "relative", marginTop: 32, marginLeft: HEADER_INDENT, maxWidth: TEXT_WIDTH, height: 22 }}
          >
            <span
              onClick={() => {
                setAddLineText("/");
                addLineInputRef.current?.focus();
              }}
              title="Ajouter une section"
              style={{
                position: "absolute",
                left: -34,
                top: -3,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                color: "oklch(0.5 0.02 290)",
                borderRadius: 6,
                cursor: "pointer",
                opacity: addLineActive ? 1 : 0,
                transition: "opacity 0.12s ease",
              }}
            >
              +
            </span>
            <input
              ref={addLineInputRef}
              value={addLineText}
              onChange={(e) => setAddLineText(e.target.value)}
              onFocus={() => setAddLineFocused(true)}
              onBlur={() => setAddLineFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (slashQuery !== null && filteredBlocks.length > 0) selectBlock(filteredBlocks[0].key);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setAddLineText("");
                  addLineInputRef.current?.blur();
                }
              }}
              placeholder="Write here"
              style={{
                width: "100%",
                fontSize: 14,
                lineHeight: 1.5,
                color: "oklch(0.88 0.01 290)",
                background: "transparent",
                border: "none",
                outline: "none",
                caretColor: accentColor,
                padding: 0,
                opacity: addLineActive ? 1 : 0,
                transition: "opacity 0.12s ease",
              }}
            />
            {slashQuery !== null && filteredBlocks.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "130%",
                  left: 0,
                  zIndex: 30,
                  background: "oklch(0.21 0.02 290)",
                  border: "1px solid oklch(0.34 0.02 290)",
                  borderRadius: 8,
                  boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
                  padding: 4,
                  minWidth: 180,
                }}
              >
                {filteredBlocks.map((o) => (
                  <span
                    key={o.key}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectBlock(o.key);
                    }}
                    style={addMenuItemStyle}
                  >
                    {o.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      </div>
    </div>
  );
}

function NoteBlockContent({ block }: { block: BlockRecord }) {
  switch (block.type) {
    case "headings":
      return <HeadingsBlock blockId={block.id} initialContent={block.content} />;
    case "objectif":
      return <ObjectifBlock blockId={block.id} initialContent={block.content} />;
    case "theorie":
      return <TheorieBlock blockId={block.id} initialContent={block.content} />;
    case "regles":
      return <ReglesBlock blockId={block.id} initialContent={block.content} />;
    case "retenir":
      return <BulletListBlock blockId={block.id} initialContent={block.content} icon="✓" iconColor={accentColor} iconBg="oklch(0.68 0.19 293 / 0.14)" />;
    case "invalide":
      return <BulletListBlock blockId={block.id} initialContent={block.content} icon="✕" iconColor={lossColor} iconBg="oklch(0.65 0.18 25 / 0.14)" />;
    default:
      return null;
  }
}

function HeadingsBlock({ blockId, initialContent }: { blockId: string; initialContent: string | null }) {
  const [headings, setHeadings] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, marginBottom: 32, marginLeft: HEADER_INDENT }}>
      {headings.map((h, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={h}
          onChange={(e) => setHeadings((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
          onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(headings))}
          onKeyDown={(e) => handleListKeyDown(e, i, headings, (next) => { setHeadings(next); updateNoteBlockContent(blockId, JSON.stringify(next)); }, refs, { allowEnter: true })}
          style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", color: "oklch(0.94 0.004 290)", background: "transparent", border: "none", outline: "none" }}
        />
      ))}
    </div>
  );
}

function ObjectifBlock({ blockId, initialContent }: { blockId: string; initialContent: string | null }) {
  const [objectif, setObjectif] = useState(initialContent ?? "");
  return (
    <div style={{ border: `1px solid ${accentColor}59`, background: "oklch(0.68 0.19 293 / 0.07)", borderRadius: 12, padding: "15px 18px", marginLeft: HEADER_INDENT, marginBottom: 24 }}>
      <textarea
        ref={(el) => autoGrow(el)}
        value={objectif}
        onChange={(e) => setObjectif(e.target.value)}
        onBlur={() => updateNoteBlockContent(blockId, objectif)}
        rows={1}
        style={{ width: "100%", boxSizing: "border-box", fontSize: 15, lineHeight: 1.6, color: "oklch(0.92 0.02 290)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", fontFamily: "inherit" }}
      />
    </div>
  );
}

function TheorieBlock({ blockId, initialContent }: { blockId: string; initialContent: string | null }) {
  const [theorie, setTheorie] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12, marginBottom: 32, marginLeft: HEADER_INDENT }}>
      {theorie.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={(el) => { refs.current[i] = el; autoGrow(el); }}
            value={p}
            onChange={(e) => setTheorie((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
            onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(theorie))}
            onKeyDown={(e) => handleListKeyDown(e, i, theorie, (next) => { setTheorie(next); updateNoteBlockContent(blockId, JSON.stringify(next)); }, refs)}
            rows={1}
            style={{ flex: 1, fontSize: 15, lineHeight: 1.72, color: "oklch(0.84 0.02 290)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", fontFamily: "inherit" }}
          />
        </div>
      ))}
    </div>
  );
}

function BulletListBlock({
  blockId,
  initialContent,
  icon,
  iconColor,
  iconBg,
}: {
  blockId: string;
  initialContent: string | null;
  icon: string;
  iconColor: string;
  iconBg: string;
}) {
  const [items, setItems] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12, marginBottom: 32, marginLeft: HEADER_INDENT }}>
      {items.map((k, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <span style={{ width: 16, height: 16, flex: "none", marginTop: 2, borderRadius: 5, border: `1.5px solid ${iconColor}`, background: iconBg, color: iconColor, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {icon}
          </span>
          <textarea
            ref={(el) => { refs.current[i] = el; autoGrow(el); }}
            value={k}
            onChange={(e) => setItems((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
            onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(items))}
            onKeyDown={(e) => handleListKeyDown(e, i, items, (next) => { setItems(next); updateNoteBlockContent(blockId, JSON.stringify(next)); }, refs, { allowEnter: true })}
            rows={1}
            style={{ flex: 1, fontSize: 14.5, lineHeight: 1.5, color: "oklch(0.86 0.02 290)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", overflowWrap: "anywhere", fontFamily: "inherit" }}
          />
        </div>
      ))}
    </div>
  );
}

function ReglesBlock({ blockId, initialContent }: { blockId: string; initialContent: string | null }) {
  const [regles, setRegles] = useState<RegleItem[]>(parseRegles(initialContent));
  const reglesRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const reglesDetailRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  return (
    <div style={{ marginTop: 12, marginBottom: 32, marginLeft: HEADER_INDENT, border: "1px solid oklch(0.26 0.02 290)", borderRadius: 12, overflow: "hidden" }}>
      {regles.map((r, i) => (
        <div key={i} style={{ padding: "13px 18px", background: "oklch(0.185 0.02 290)", borderBottom: i < regles.length - 1 ? "1px solid oklch(0.22 0.02 290)" : "none" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
            <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12, color: accentColor, flex: "none", paddingTop: 3 }}>{i + 1}</span>
            <textarea
              ref={(el) => { reglesRefs.current[i] = el; autoGrow(el); }}
              value={r.title}
              onChange={(e) => setRegles((arr) => arr.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))}
              onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(regles))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const next = [...regles.slice(0, i + 1), { title: "", details: [] }, ...regles.slice(i + 1)];
                  setRegles(next);
                  updateNoteBlockContent(blockId, JSON.stringify(next));
                  requestAnimationFrame(() => reglesRefs.current[i + 1]?.focus());
                  return;
                }
                if ((e.key === "Backspace" || e.key === "Delete") && regles[i].title === "" && regles[i].details.length === 0 && regles.length > 1) {
                  e.preventDefault();
                  const next = regles.filter((_, xi) => xi !== i);
                  setRegles(next);
                  updateNoteBlockContent(blockId, JSON.stringify(next));
                  const focusIdx = Math.max(0, i - 1);
                  requestAnimationFrame(() => reglesRefs.current[focusIdx]?.focus());
                }
              }}
              rows={1}
              style={{ flex: 1, fontSize: 14.5, lineHeight: 1.6, color: "oklch(0.86 0.02 290)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", overflowWrap: "anywhere", fontFamily: "inherit" }}
            />
          </div>
          {r.details.map((d, di) => (
            <div
              key={di}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginTop: di === 0 ? 8 : 6,
                marginLeft: 25,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  flex: "none",
                  marginTop: 3,
                  borderRadius: 4,
                  border: `1.5px solid ${accentColor}`,
                  background: "oklch(0.68 0.19 293 / 0.14)",
                  color: accentColor,
                  fontSize: 8.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✓
              </span>
              <textarea
                ref={(el) => { reglesDetailRefs.current[`${i}-${di}`] = el; autoGrow(el); }}
                value={d}
                onChange={(e) =>
                  setRegles((arr) =>
                    arr.map((x, xi) => (xi === i ? { ...x, details: x.details.map((dd, ddi) => (ddi === di ? e.target.value : dd)) } : x))
                  )
                }
                onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(regles))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const nextDetails = [...r.details.slice(0, di + 1), "", ...r.details.slice(di + 1)];
                    const next = regles.map((x, xi) => (xi === i ? { ...x, details: nextDetails } : x));
                    setRegles(next);
                    updateNoteBlockContent(blockId, JSON.stringify(next));
                    requestAnimationFrame(() => reglesDetailRefs.current[`${i}-${di + 1}`]?.focus());
                    return;
                  }
                  if ((e.key === "Backspace" || e.key === "Delete") && d === "") {
                    e.preventDefault();
                    const nextDetails = r.details.filter((_, ddi) => ddi !== di);
                    const next = regles.map((x, xi) => (xi === i ? { ...x, details: nextDetails } : x));
                    setRegles(next);
                    updateNoteBlockContent(blockId, JSON.stringify(next));
                    if (di > 0) requestAnimationFrame(() => reglesDetailRefs.current[`${i}-${di - 1}`]?.focus());
                    else requestAnimationFrame(() => reglesRefs.current[i]?.focus());
                  }
                }}
                placeholder="Détails…"
                rows={1}
                style={{
                  display: "block",
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "oklch(0.68 0.02 290)",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                  fontFamily: "inherit",
                }}
              />
            </div>
          ))}
          <span
            onClick={() => {
              const nextDetails = [...r.details, ""];
              const next = regles.map((x, xi) => (xi === i ? { ...x, details: nextDetails } : x));
              setRegles(next);
              updateNoteBlockContent(blockId, JSON.stringify(next));
              requestAnimationFrame(() => reglesDetailRefs.current[`${i}-${nextDetails.length - 1}`]?.focus());
            }}
            style={{ marginLeft: 25, marginTop: 4, display: "inline-block", fontSize: 11.5, color: "oklch(0.5 0.02 290)", cursor: "pointer" }}
          >
            + détails
          </span>
        </div>
      ))}
    </div>
  );
}


function ExampleCategory({
  title,
  onRename,
  onDelete,
  onAddExample,
  examples,
  images,
  onChanged,
}: {
  title: string;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onAddExample: () => void;
  examples: ExampleRecord[];
  images: ImageRecord[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(title);
  const [hover, setHover] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
      >
        <PlusGripCluster visible={hover} plusTitle="Ajouter un exemple" onPlus={onAddExample} onDelete={onDelete} />
        <span
          onClick={() => setCollapsed((c) => !c)}
          style={{ width: 14, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronIcon color="oklch(0.5 0.02 290)" down={!collapsed} />
        </span>
        {onRename ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onRename(name)}
            style={{ fontSize: 14, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: "oklch(0.92 0.005 290)", padding: "2px 4px", marginLeft: -4 }}
          />
        ) : (
          <span onClick={() => setCollapsed((c) => !c)} style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.7 0.02 290)", cursor: "pointer" }}>
            {title}
          </span>
        )}
        <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, color: "oklch(0.5 0.02 290)" }}>{examples.length}</span>
      </div>
      {!collapsed &&
        (examples.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginLeft: HEADER_INDENT }}>
            {examples.map((ex) => (
              <ExampleCard key={ex.id} example={ex} images={images.filter((i) => i.exampleId === ex.id)} onChanged={onChanged} />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "oklch(0.5 0.02 290)", marginLeft: HEADER_INDENT }}>Aucun exemple.</div>
        ))}
    </div>
  );
}

function ExampleCard({ example, images, onChanged }: { example: ExampleRecord; images: ImageRecord[]; onChanged: () => void }) {
  const [title, setTitle] = useState(example.title);
  const [caption, setCaption] = useState(example.caption ?? "");
  const [tags, setTags] = useState<string[]>(parseArr(example.tags));
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [headerHover, setHeaderHover] = useState(false);
  const [showTradePicker, setShowTradePicker] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveTags = (next: string[]) => {
    setTags(next);
    updateExample(example.id, { tags: next });
  };

  return (
    <div style={{ border: "1px solid oklch(0.26 0.02 290)", borderRadius: 12, overflow: "hidden", background: "oklch(0.185 0.02 290)" }}>
      <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => updateExample(example.id, { title })}
            style={{ flex: 1, fontSize: 15, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: "oklch(0.94 0.004 290)" }}
          />
          <MoreMenuButton
            visible={headerHover}
            onDelete={async () => {
              await deleteExample(example.id);
              onChanged();
            }}
          />
        </div>
        <textarea
          ref={(el) => autoGrow(el)}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => updateExample(example.id, { caption })}
          rows={1}
          style={{ fontSize: 13.5, lineHeight: 1.6, color: "oklch(0.72 0.02 290)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 3 }}>
          {tags.map((t, ti) => {
            const st = tagStyle(t);
            return (
              <span key={ti} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 5px 3px 9px", borderRadius: 999, background: st.bg, color: st.color }}>
                {t}
                <span onClick={() => saveTags(tags.filter((_, xi) => xi !== ti))} style={{ cursor: "pointer", fontSize: 12, opacity: 0.7 }}>
                  ✕
                </span>
              </span>
            );
          })}
          {addingTag ? (
            <input
              autoFocus
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={() => {
                const v = tagDraft.trim();
                if (v) saveTags([...tags, v]);
                setTagDraft("");
                setAddingTag(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setTagDraft("");
                  setAddingTag(false);
                }
              }}
              style={{ width: 70, fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 8px", borderRadius: 999, border: `1px solid ${accentColor}`, background: "oklch(0.68 0.19 293 / 0.12)", color: "oklch(0.85 0.06 290)", outline: "none" }}
            />
          ) : (
            <span onClick={() => setAddingTag(true)} style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 10px", borderRadius: 999, border: "1px dashed oklch(0.34 0.02 290)", color: "oklch(0.6 0.02 290)", cursor: "pointer" }}>
              + tag
            </span>
          )}
        </div>
      </div>
      <div style={{ borderTop: "1px solid oklch(0.24 0.02 290)" }}>
        {images.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: images.length === 1 ? "1fr" : "repeat(2, 1fr)", gap: 10, padding: 10 }}>
            {images.map((img) => {
              return (
                <div key={img.id} style={{ position: "relative", aspectRatio: "16 / 9" }}>
                  <div
                    onClick={() => setLightboxUrl(img.url)}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 8,
                      backgroundImage: `url(${img.url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      border: "1px solid oklch(0.32 0.02 290 / 0.5)",
                      cursor: "zoom-in",
                    }}
                  />
                  {img.tradeId && (
                    <Link
                      href={`/trades/${img.tradeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ouvrir le trade dans un nouvel onglet"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        bottom: 7,
                        left: 7,
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        fontSize: 10,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "oklch(0.15 0.02 290 / 0.75)",
                        color: "oklch(0.85 0.02 290)",
                      }}
                    >
                      Trade ↗
                    </Link>
                  )}
                  <div
                    onClick={async () => {
                      await removeExampleImage(img.id);
                      onChanged();
                    }}
                    style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, borderRadius: 6, background: "oklch(0.15 0.02 290 / 0.75)", color: "oklch(0.9 0.005 290)", cursor: "pointer" }}
                  >
                    ✕
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.append("image", file);
            await addExampleImage(example.id, fd);
            if (fileRef.current) fileRef.current.value = "";
            onChanged();
          }}
        />
        <div style={{ margin: "0 12px 12px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ flex: 1, height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px dashed oklch(0.34 0.02 290)", borderRadius: 8, color: "oklch(0.6 0.02 290)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11 }}
            >
              <span style={{ fontSize: 16 }}>+</span> image
            </div>
            <div style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() => setShowTradePicker((s) => !s)}
                style={{ height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px dashed oklch(0.34 0.02 290)", borderRadius: 8, color: "oklch(0.6 0.02 290)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11 }}
              >
                <span style={{ fontSize: 16 }}>+</span> importer un trade
              </div>
              {showTradePicker && (
                <TradePicker
                  onClose={() => setShowTradePicker(false)}
                  onSelect={async (tradeId) => {
                    setShowTradePicker(false);
                    await importTradeImages(example.id, tradeId);
                    onChanged();
                  }}
                />
              )}
            </div>
            <div
              onClick={() => setShowPasteBox((s) => !s)}
              style={{ flex: 1, height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px dashed oklch(0.34 0.02 290)", borderRadius: 8, color: "oklch(0.6 0.02 290)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11 }}
            >
              <span style={{ fontSize: 16 }}>+</span> coller
            </div>
          </div>
          {showPasteBox && (
            <div style={{ marginTop: 8 }}>
              <input
                autoFocus
                value={pasteValue}
                disabled={pasteLoading}
                onChange={(e) => {
                  setPasteValue(e.target.value);
                  setPasteError(false);
                }}
                onPaste={async (e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of Array.from(items)) {
                    if (item.type.startsWith("image/")) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file) {
                        const fd = new FormData();
                        fd.append("image", file);
                        await addExampleImage(example.id, fd);
                        onChanged();
                      }
                      setShowPasteBox(false);
                      setPasteValue("");
                      return;
                    }
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = pasteValue.trim();
                    if (!v) return;
                    setPasteLoading(true);
                    setPasteError(false);
                    const { ok } = await addExampleImageByUrl(example.id, v);
                    setPasteLoading(false);
                    if (ok) {
                      onChanged();
                      setShowPasteBox(false);
                      setPasteValue("");
                    } else {
                      setPasteError(true);
                    }
                  } else if (e.key === "Escape") {
                    setShowPasteBox(false);
                    setPasteValue("");
                    setPasteError(false);
                  }
                }}
                placeholder={pasteLoading ? "Chargement de l'image…" : "Collez (Cmd/Ctrl+V) une image ou une adresse d'image, puis Entrée…"}
                style={{
                  width: "100%",
                  height: 42,
                  boxSizing: "border-box",
                  padding: "0 12px",
                  fontSize: 12.5,
                  borderRadius: 8,
                  border: `1px dashed ${pasteError ? lossColor : accentColor}`,
                  background: "oklch(0.68 0.19 293 / 0.08)",
                  color: "oklch(0.88 0.02 290)",
                  outline: "none",
                }}
              />
              {pasteError && (
                <div style={{ marginTop: 5, fontSize: 11.5, color: lossColor }}>
                  Impossible de charger cette image (lien invalide, protégé, ou pas une image). Réessaie avec un autre lien, ou colle l&apos;image elle-même (Cmd/Ctrl+V).
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "oklch(0.08 0.01 290 / 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, boxShadow: "0 20px 60px -10px oklch(0 0 0 / 0.6)" }}
          />
          <div
            onClick={() => setLightboxUrl(null)}
            style={{
              position: "absolute",
              top: 20,
              right: 24,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              borderRadius: 8,
              background: "oklch(0.18 0.02 290 / 0.8)",
              color: "oklch(0.9 0.005 290)",
              cursor: "pointer",
            }}
          >
            ✕
          </div>
        </div>
      )}
    </div>
  );
}

function TradePicker({ onSelect, onClose }: { onSelect: (tradeId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TradeSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const t = setTimeout(() => {
      setLoading(true);
      searchTrades(query).then((r) => {
        if (!ignore) {
          setResults(r);
          setLoading(false);
        }
      });
    }, 200);
    return () => {
      ignore = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div
      onMouseLeave={onClose}
      style={{
        position: "absolute",
        bottom: "110%",
        left: 0,
        right: 0,
        zIndex: 40,
        maxHeight: 320,
        overflowY: "auto",
        background: "oklch(0.21 0.02 290)",
        border: "1px solid oklch(0.34 0.02 290)",
        borderRadius: 10,
        boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
        padding: 8,
      }}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher un symbole..."
        style={{ width: "100%", fontSize: 12.5, padding: "7px 9px", borderRadius: 7, border: "1px solid oklch(0.32 0.02 290)", background: "oklch(0.16 0.02 290)", color: "oklch(0.9 0.005 290)", outline: "none", marginBottom: 6, boxSizing: "border-box" }}
      />
      {loading && <div style={{ fontSize: 12, color: "oklch(0.55 0.02 290)", padding: "6px 4px" }}>Chargement...</div>}
      {!loading && results.length === 0 && <div style={{ fontSize: 12, color: "oklch(0.55 0.02 290)", padding: "6px 4px" }}>Aucun trade trouvé.</div>}
      {!loading &&
        results.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12.5 }}
          >
            <span style={{ color: "oklch(0.9 0.005 290)", fontWeight: 600 }}>
              {t.symbol} <span style={{ fontWeight: 400, color: "oklch(0.6 0.02 290)" }}>· {t.setup}</span>
            </span>
            <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, color: t.pnl >= 0 ? accentColor : lossColor }}>
              {t.date.slice(0, 10)} · {t.imageCount} img
            </span>
          </div>
        ))}
    </div>
  );
}

function DraggableBlock({
  blockKey,
  setRef,
  hoverKey,
  setHoverKey,
  onDragStart,
  onDelete,
  children,
}: {
  blockKey: string;
  setRef: (el: HTMLDivElement | null) => void;
  hoverKey: string | null;
  setHoverKey: (fn: (k: string | null) => string | null) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={setRef}
      onMouseEnter={() => setHoverKey(() => blockKey)}
      onMouseLeave={() => setHoverKey((k) => (k === blockKey ? null : k))}
      style={{ position: "relative" }}
    >
      <div style={{ position: "absolute", left: -30, top: 2 }}>
        <GripMenuButton visible={hoverKey === blockKey} onDragStart={onDragStart} onDelete={onDelete} />
      </div>
      {children}
    </div>
  );
}

const addMenuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 10px",
  fontSize: 13,
  color: "oklch(0.82 0.01 290)",
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
