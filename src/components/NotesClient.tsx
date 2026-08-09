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
  reorderExamples,
  addExampleImage,
  addExampleImageByUrl,
  updateExampleImageCaption,
  removeExampleImage,
  searchTrades,
  importTradeImages,
} from "@/lib/actions/notes";

const lossColor = "oklch(0.65 0.18 25)";
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const TEXT_WIDTH = 1040;
const HEADER_INDENT = 75;

type NoteRecord = {
  id: string;
  parentId: string | null;
  title: string;
  order: number;
};

type BlockRecord = { id: string; noteId: string; categoryId: string | null; exampleId: string | null; type: string; content: string | null; order: number };

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
type ExampleRecord = { id: string; noteId: string; categoryId: string | null; title: string; caption: string | null; tags: string | null; hideText: boolean; imagesPerRow: number; order: number };
type ImageRecord = { id: string; exampleId: string; url: string; caption: string | null; tradeId: string | null; order: number };
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

function normalizeRegleItems(parsed: unknown): RegleItem[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((x) => {
    if (typeof x === "string") return { title: x, details: [] };
    if (Array.isArray(x?.details)) return { title: x?.title ?? "", details: x.details };
    if (typeof x?.detail === "string" && x.detail) return { title: x?.title ?? "", details: [x.detail] };
    return { title: x?.title ?? "", details: [] };
  });
}

function parseReglesBlock(s: string | null): { label: string; items: RegleItem[] } {
  if (!s) return { label: "", items: [] };
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return { label: "", items: normalizeRegleItems(parsed) };
    return { label: parsed?.label ?? "", items: normalizeRegleItems(parsed?.items) };
  } catch {
    return { label: "", items: [] };
  }
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

function ChartIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flex: "none" }}>
      <path d="M1.5 12.5V8.5M6 12.5V5M10.5 12.5V1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
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

  async function addBlock(type: string, categoryId: string | null = null) {
    if (type === "exemples") {
      const created = await createExemplesBlock(note.id);
      setBlockList((prev) => [...prev, { id: created.id, noteId: note.id, categoryId: null, exampleId: null, type: "exemples", content: null, order: prev.length }]);
      onChanged();
      return;
    }
    const created = await createNoteBlock(note.id, type, categoryId);
    setBlockList((prev) => [...prev, { id: created.id, noteId: note.id, categoryId, exampleId: null, type, content: created.content, order: created.order }]);
  }

  async function deleteBlock(blockId: string) {
    setBlockList((prev) => prev.filter((b) => b.id !== blockId));
    await deleteNoteBlock(blockId);
    onChanged();
  }

  const uncategorized = examples.filter((e) => !e.categoryId || !categories.some((c) => c.id === e.categoryId));

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

      {blockList.filter((block) => !block.categoryId).map((block) => {
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
                    <ExemplesSectionTitle
                      initialTitle={block.content || "Exemples"}
                      onRename={(title) => {
                        updateNoteBlockContent(block.id, title);
                        setBlockList((prev) => prev.map((b) => (b.id === block.id ? { ...b, content: title } : b)));
                      }}
                    />
                  </div>

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
                        examples={examples.filter((e) => e.categoryId === cat.id)}
                        images={images}
                        onChanged={onChanged}
                        blocks={blockList.filter((b) => b.categoryId === cat.id && !b.exampleId)}
                        onAddBlock={(type) => addBlock(type, cat.id)}
                        onDeleteBlock={deleteBlock}
                        exampleBlocks={blockList}
                        storageKey={cat.id}
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
                        exampleBlocks={blockList}
                        storageKey={note.id + "-uncategorized"}
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

function NoteBlockContent({ block, indent = HEADER_INDENT }: { block: BlockRecord; indent?: number }) {
  switch (block.type) {
    case "headings":
      return <HeadingsBlock blockId={block.id} initialContent={block.content} indent={indent} />;
    case "objectif":
      return <ObjectifBlock blockId={block.id} initialContent={block.content} indent={indent} />;
    case "theorie":
      return <TheorieBlock blockId={block.id} initialContent={block.content} indent={indent} />;
    case "regles":
      return <ReglesBlock blockId={block.id} initialContent={block.content} indent={indent} />;
    case "retenir":
      return <BulletListBlock blockId={block.id} initialContent={block.content} icon="✓" iconColor={accentColor} iconBg="oklch(0.68 0.19 293 / 0.14)" indent={indent} />;
    case "invalide":
      return <BulletListBlock blockId={block.id} initialContent={block.content} icon="✕" iconColor={lossColor} iconBg="oklch(0.65 0.18 25 / 0.14)" indent={indent} />;
    default:
      return null;
  }
}

function HeadingsBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const [headings, setHeadings] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, marginBottom: 32, marginLeft: indent }}>
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

function ObjectifBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const [objectif, setObjectif] = useState(initialContent ?? "");
  return (
    <div style={{ border: `1px solid ${accentColor}59`, background: "oklch(0.68 0.19 293 / 0.07)", borderRadius: 12, padding: "15px 18px", marginLeft: indent, marginBottom: 24 }}>
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

function TheorieBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const [theorie, setTheorie] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12, marginBottom: 32, marginLeft: indent }}>
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
  indent = HEADER_INDENT,
}: {
  blockId: string;
  initialContent: string | null;
  icon: string;
  iconColor: string;
  iconBg: string;
  indent?: number;
}) {
  const [items, setItems] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12, marginBottom: 32, marginLeft: indent }}>
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

function ReglesBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const parsed = useMemo(() => parseReglesBlock(initialContent), [initialContent]);
  const [label, setLabel] = useState(parsed.label);
  const [regles, setRegles] = useState<RegleItem[]>(parsed.items);
  const [hover, setHover] = useState(false);
  const [addingLabel, setAddingLabel] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const reglesRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const reglesDetailRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const save = (items: RegleItem[], lbl: string = label) => updateNoteBlockContent(blockId, JSON.stringify({ label: lbl, items }));
  const canFloatLabelButton = indent >= 78;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", marginTop: 12, marginBottom: 32, marginLeft: indent }}
    >
      {(label || addingLabel) && (
        <input
          autoFocus={addingLabel}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            save(regles, label);
            setAddingLabel(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setLabel(parsed.label);
              setAddingLabel(false);
            }
          }}
          placeholder="Titre de la liste"
          style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: "oklch(0.7 0.02 290)", background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "inherit" }}
        />
      )}
      {!label && !addingLabel && (
        <span
          onClick={() => setAddingLabel(true)}
          title="Ajouter un titre"
          style={{
            position: canFloatLabelButton ? "absolute" : "static",
            left: canFloatLabelButton ? -78 : undefined,
            top: canFloatLabelButton ? 3 : undefined,
            display: canFloatLabelButton ? undefined : "inline-block",
            marginBottom: canFloatLabelButton ? undefined : 8,
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: 10,
            padding: "3px 10px",
            borderRadius: 999,
            border: "1px dashed oklch(0.34 0.02 290)",
            color: "oklch(0.6 0.02 290)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            opacity: hover ? 1 : 0,
            transition: "opacity 0.12s ease",
          }}
        >
          + titre
        </span>
      )}
      <div style={{ border: "1px solid oklch(0.26 0.02 290)", borderRadius: 12, overflow: "hidden" }}>
      {regles.map((r, i) => (
        <div
          key={i}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
          style={{ padding: "13px 18px", background: "oklch(0.185 0.02 290)", borderBottom: i < regles.length - 1 ? "1px solid oklch(0.22 0.02 290)" : "none" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
            <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12, color: accentColor, flex: "none", paddingTop: 3 }}>{i + 1}</span>
            <textarea
              ref={(el) => { reglesRefs.current[i] = el; autoGrow(el); }}
              value={r.title}
              onChange={(e) => setRegles((arr) => arr.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))}
              onBlur={() => save(regles)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const next = [...regles.slice(0, i + 1), { title: "", details: [] }, ...regles.slice(i + 1)];
                  setRegles(next);
                  save(next);
                  requestAnimationFrame(() => reglesRefs.current[i + 1]?.focus());
                  return;
                }
                if ((e.key === "Backspace" || e.key === "Delete") && regles[i].title === "" && regles[i].details.length === 0 && regles.length > 1) {
                  e.preventDefault();
                  const next = regles.filter((_, xi) => xi !== i);
                  setRegles(next);
                  save(next);
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
                onBlur={() => save(regles)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const nextDetails = [...r.details.slice(0, di + 1), "", ...r.details.slice(di + 1)];
                    const next = regles.map((x, xi) => (xi === i ? { ...x, details: nextDetails } : x));
                    setRegles(next);
                    save(next);
                    requestAnimationFrame(() => reglesDetailRefs.current[`${i}-${di + 1}`]?.focus());
                    return;
                  }
                  if ((e.key === "Backspace" || e.key === "Delete") && d === "") {
                    e.preventDefault();
                    const nextDetails = r.details.filter((_, ddi) => ddi !== di);
                    const next = regles.map((x, xi) => (xi === i ? { ...x, details: nextDetails } : x));
                    setRegles(next);
                    save(next);
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
              save(next);
              requestAnimationFrame(() => reglesDetailRefs.current[`${i}-${nextDetails.length - 1}`]?.focus());
            }}
            style={{
              marginLeft: 25,
              marginTop: 4,
              display: "inline-block",
              fontSize: 11.5,
              color: "oklch(0.5 0.02 290)",
              cursor: "pointer",
              opacity: hoverIdx === i ? 1 : 0,
              transition: "opacity 0.12s ease",
            }}
          >
            + détails
          </span>
        </div>
      ))}
      </div>
    </div>
  );
}


function AddBlockButton({ visible, onAdd }: { visible: boolean; onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = Object.entries(BLOCK_TYPE_LABELS).filter(([key]) => key !== "exemples");
  return (
    <div style={{ position: "relative", flex: "none", opacity: visible || open ? 1 : 0, transition: "opacity 0.12s ease" }} onMouseLeave={() => setOpen(false)}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Ajouter un bloc"
        style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 10px", borderRadius: 999, border: "1px dashed oklch(0.34 0.02 290)", color: "oklch(0.6 0.02 290)", cursor: "pointer" }}
      >
        + bloc
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            zIndex: 30,
            background: "oklch(0.21 0.02 290)",
            border: "1px solid oklch(0.34 0.02 290)",
            borderRadius: 8,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            minWidth: 160,
          }}
        >
          {options.map(([key, label]) => (
            <span
              key={key}
              onClick={() => {
                onAdd(key);
                setOpen(false);
              }}
              style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: "oklch(0.85 0.02 290)", whiteSpace: "nowrap" }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryBlock({ block, onDelete, indent }: { block: BlockRecord; onDelete: () => void; indent?: number }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ position: "relative" }}>
      <span
        onClick={onDelete}
        title="Supprimer le bloc"
        style={{
          position: "absolute",
          top: -2,
          right: 0,
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          borderRadius: 6,
          color: "oklch(0.55 0.02 290)",
          cursor: "pointer",
          opacity: hover ? 1 : 0,
          transition: "opacity 0.12s ease",
        }}
      >
        ✕
      </span>
      <NoteBlockContent block={block} indent={indent} />
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
  blocks,
  onAddBlock,
  onDeleteBlock,
  exampleBlocks,
  storageKey,
}: {
  title: string;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onAddExample: () => void;
  examples: ExampleRecord[];
  images: ImageRecord[];
  onChanged: () => void;
  blocks?: BlockRecord[];
  onAddBlock?: (type: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  exampleBlocks?: BlockRecord[];
  storageKey?: string;
}) {
  const [name, setName] = useState(title);
  const [hover, setHover] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (storageKey && localStorage.getItem(`exCatCollapsed:${storageKey}`) === "1") setCollapsed(true);
  }, [storageKey]);

  const setCollapsedPersist = (fn: (c: boolean) => boolean) => {
    setCollapsed((c) => {
      const next = fn(c);
      if (storageKey) {
        if (next) localStorage.setItem(`exCatCollapsed:${storageKey}`, "1");
        else localStorage.removeItem(`exCatCollapsed:${storageKey}`);
      }
      return next;
    });
  };
  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
      >
        <PlusGripCluster visible={hover} plusTitle="Ajouter un exemple" onPlus={onAddExample} onDelete={onDelete} />
        <span
          onClick={() => setCollapsedPersist((c) => !c)}
          style={{ width: 14, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronIcon color="oklch(0.5 0.02 290)" down={!collapsed} />
        </span>
        {onRename ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onRename(name)}
            style={{ fontSize: 14, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: "oklch(0.92 0.005 290)", padding: "2px 4px", marginLeft: -4, width: `${Math.max(name.length + 2, 6)}ch`, minWidth: 0 }}
          />
        ) : (
          <span onClick={() => setCollapsedPersist((c) => !c)} style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.7 0.02 290)", cursor: "pointer" }}>
            {title}
          </span>
        )}
        <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, color: "oklch(0.5 0.02 290)" }}>{examples.length}</span>
        {onAddBlock && <AddBlockButton visible={hover} onAdd={onAddBlock} />}
      </div>
      {!collapsed && blocks && blocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
          {blocks.map((b) => (
            <CategoryBlock key={b.id} block={b} onDelete={() => onDeleteBlock?.(b.id)} />
          ))}
        </div>
      )}
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginLeft: HEADER_INDENT }}>
          {examples.length === 0 && <div style={{ fontSize: 13, color: "oklch(0.5 0.02 290)" }}>Aucun exemple.</div>}
          {examples.length > 0 &&
            examples.map((ex, exIdx) => (
              <div key={ex.id} style={{ display: "flex", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "none", paddingTop: 14 }}>
                  <span
                    onClick={async () => {
                      if (exIdx === 0) return;
                      const next = [...examples];
                      [next[exIdx - 1], next[exIdx]] = [next[exIdx], next[exIdx - 1]];
                      await reorderExamples(next.map((e) => e.id));
                      onChanged();
                    }}
                    title="Monter"
                    style={{ width: 18, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: exIdx === 0 ? "default" : "pointer", opacity: exIdx === 0 ? 0.25 : 1, color: "oklch(0.55 0.02 290)", transform: "rotate(-90deg)" }}
                  >
                    <ChevronIcon color="currentColor" down={false} />
                  </span>
                  <span
                    onClick={async () => {
                      if (exIdx === examples.length - 1) return;
                      const next = [...examples];
                      [next[exIdx], next[exIdx + 1]] = [next[exIdx + 1], next[exIdx]];
                      await reorderExamples(next.map((e) => e.id));
                      onChanged();
                    }}
                    title="Descendre"
                    style={{ width: 18, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: exIdx === examples.length - 1 ? "default" : "pointer", opacity: exIdx === examples.length - 1 ? 0.25 : 1, color: "oklch(0.55 0.02 290)" }}
                  >
                    <ChevronIcon color="currentColor" down={true} />
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ExampleCard
                    example={ex}
                    images={images.filter((i) => i.exampleId === ex.id)}
                    blocks={(exampleBlocks ?? []).filter((b) => b.exampleId === ex.id)}
                    onChanged={onChanged}
                  />
                </div>
              </div>
            ))}
          <span
            onClick={onAddExample}
            title="Ajouter un exemple"
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px dashed oklch(0.34 0.02 290)",
              color: "oklch(0.6 0.02 290)",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            +
          </span>
        </div>
      )}
    </div>
  );
}

function ExampleImage({ img, onOpen, onRemove }: { img: ImageRecord; onOpen: () => void; onRemove: () => void }) {
  const [caption, setCaption] = useState(img.caption ?? "");
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ position: "relative", aspectRatio: "16 / 9" }}>
        <div
          onClick={onOpen}
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
          onClick={onRemove}
          style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, borderRadius: 6, background: "oklch(0.15 0.02 290 / 0.75)", color: "oklch(0.9 0.005 290)", cursor: "pointer" }}
        >
          ✕
        </div>
      </div>
      {(caption || hover) && (
        <textarea
          ref={(el) => autoGrow(el)}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => updateExampleImageCaption(img.id, caption)}
          placeholder="Légende de l'image"
          rows={1}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            marginTop: 5,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "oklch(0.92 0.004 290)",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "hidden",
            overflowWrap: "anywhere",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        />
      )}
    </div>
  );
}

function ExampleCard({ example, images, blocks, onChanged }: { example: ExampleRecord; images: ImageRecord[]; blocks: BlockRecord[]; onChanged: () => void }) {
  const [title, setTitle] = useState(example.title);
  const [exampleBlocks, setExampleBlocks] = useState<BlockRecord[]>(blocks);
  const [headerHover, setHeaderHover] = useState(false);
  const [showTradePicker, setShowTradePicker] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [imagesPerRow, setImagesPerRow] = useState<1 | 2>(example.imagesPerRow === 1 ? 1 : 2);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleImagesPerRow = () => {
    const next: 1 | 2 = imagesPerRow === 2 ? 1 : 2;
    setImagesPerRow(next);
    updateExample(example.id, { imagesPerRow: next });
  };

  return (
    <div style={{ border: "1px solid oklch(0.26 0.02 290)", borderRadius: 12, background: "oklch(0.185 0.02 290)" }}>
      <div
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
        style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            onClick={() => setCollapsed((c) => !c)}
            style={{ width: 14, height: 22, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ChevronIcon color="oklch(0.5 0.02 290)" down={!collapsed} />
          </span>
          {title || editingTitle ? (
            <input
              autoFocus={editingTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                updateExample(example.id, { title });
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              style={{ flex: 1, fontSize: 15, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: "oklch(0.94 0.004 290)" }}
            />
          ) : headerHover ? (
            <span
              onClick={() => setEditingTitle(true)}
              title="Ajouter un titre"
              style={{
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 999,
                border: "1px dashed oklch(0.34 0.02 290)",
                color: "oklch(0.6 0.02 290)",
                cursor: "pointer",
                width: "fit-content",
              }}
            >
              + titre
            </span>
          ) : null}
          <span
            onClick={toggleImagesPerRow}
            title="Nombre d'images par ligne"
            style={{
              flex: "none",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid oklch(0.34 0.02 290)",
              color: "oklch(0.6 0.02 290)",
              cursor: "pointer",
              opacity: headerHover ? 1 : 0,
              transition: "opacity 0.12s ease",
              whiteSpace: "nowrap",
            }}
          >
            {imagesPerRow} img/ligne
          </span>
          <AddBlockButton
            visible={headerHover}
            onAdd={async (type) => {
              const created = await createNoteBlock(example.noteId, type, null, example.id);
              setExampleBlocks((prev) => [...prev, created]);
              onChanged();
            }}
          />
          <MoreMenuButton
            visible={headerHover}
            onDelete={async () => {
              await deleteExample(example.id);
              onChanged();
            }}
          />
        </div>
      </div>
      {!collapsed && (
      <div style={{ borderTop: "1px solid oklch(0.24 0.02 290)" }}>
        {exampleBlocks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", padding: "10px 12px 0" }}>
            {exampleBlocks.map((b) => (
              <CategoryBlock
                key={b.id}
                block={b}
                indent={0}
                onDelete={async () => {
                  setExampleBlocks((prev) => prev.filter((x) => x.id !== b.id));
                  await deleteNoteBlock(b.id);
                  onChanged();
                }}
              />
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: images.length === 1 ? "1fr" : `repeat(${imagesPerRow}, 1fr)`, gap: 10, padding: 10 }}>
            {images.map((img) => (
              <ExampleImage
                key={img.id}
                img={img}
                onOpen={() => setLightboxUrl(img.url)}
                onRemove={async () => {
                  await removeExampleImage(img.id);
                  onChanged();
                }}
              />
            ))}
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
            setFileError(null);
            if (file.size > MAX_IMAGE_BYTES) {
              setFileError(
                `Image trop volumineuse (${(file.size / (1024 * 1024)).toFixed(1)} Mo, max ${MAX_IMAGE_BYTES / (1024 * 1024)} Mo). Compresse-la ou réduis sa résolution avant de l'ajouter.`
              );
              if (fileRef.current) fileRef.current.value = "";
              return;
            }
            try {
              const fd = new FormData();
              fd.append("image", file);
              await addExampleImage(example.id, fd);
              onChanged();
            } catch {
              setFileError("Échec de l'ajout de l'image. Réessaie avec un fichier plus léger.");
            } finally {
              if (fileRef.current) fileRef.current.value = "";
            }
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
          {fileError && (
            <div style={{ marginTop: 5, fontSize: 11.5, color: lossColor }}>{fileError}</div>
          )}
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
                        setFileError(null);
                        if (file.size > MAX_IMAGE_BYTES) {
                          setFileError(
                            `Image trop volumineuse (${(file.size / (1024 * 1024)).toFixed(1)} Mo, max ${MAX_IMAGE_BYTES / (1024 * 1024)} Mo). Compresse-la ou réduis sa résolution avant de l'ajouter.`
                          );
                        } else {
                          try {
                            const fd = new FormData();
                            fd.append("image", file);
                            await addExampleImage(example.id, fd);
                            onChanged();
                          } catch {
                            setFileError("Échec de l'ajout de l'image. Réessaie avec un fichier plus léger.");
                          }
                        }
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
      )}
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

function ExemplesSectionTitle({ initialTitle, onRename }: { initialTitle: string; onRename: (title: string) => void }) {
  const [title, setTitle] = useState(initialTitle);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <ChartIcon color="oklch(0.92 0.004 290)" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const val = title.trim() || "Exemples";
          setTitle(val);
          onRename(val);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "oklch(0.92 0.004 290)",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          width: `${Math.max(title.length * 1.3 + 1, 6)}ch`,
        }}
      />
    </span>
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
