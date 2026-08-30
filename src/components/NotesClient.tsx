"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, MAX_SOURCE_BYTES } from "@/lib/compressImage";
import Link from "next/link";
import Image from "next/image";
import { accentColor } from "@/lib/theme";
import ImageLightbox from "@/components/ImageLightbox";
import MoveExampleMenu from "@/components/MoveExampleMenu";
import MoveCategoryMenu from "@/components/MoveCategoryMenu";
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
  deleteTradeType,
  duplicateExample,
  reorderExamples,
  reorderCategories,
  updateExampleImageCaption,
  removeExampleImage,
  setCategoryCollapsed,
  setExampleCollapsed,
  setUncategorizedCollapsed,
  searchTrades,
  importTradeImages,
} from "@/lib/actions/notes";

const lossColor = "oklch(0.7 0.25 18)";
// Kept under the ~1MB ceiling the deployment stalls at, with room for the
// multipart envelope. See src/lib/compressImage.ts.
const MAX_IMAGE_BYTES = 850 * 1024;
// Marks a locally-previewed image that has no database row yet.
const PENDING_PREFIX = "pending:";
const TEXT_WIDTH = 1040;
const HEADER_INDENT = 75;

/**
 * The gutter as the browser should apply it.
 *
 * Blocks pass a number, because one of them compares it, and a nested block
 * passes 0 to sit flush. The standard gutter is handed over as the CSS variable
 * instead, which is the one that shrinks on a phone.
 */
const indentCss = (indent: number): string | number => (indent === HEADER_INDENT ? "var(--note-indent)" : indent);

/**
 * The width a thumbnail tile occupies, per images-per-row setting.
 *
 * Inside the 1040px column, minus the grid padding and the gap between two
 * tiles. A tile now keeps its image's own proportions, so the image is drawn at
 * exactly this width — which is what makes these numbers usable as `sizes`.
 */
const TILE_WIDTH = { 1: 1020, 2: 505 } as const;

/**
 * How much wider than the tile to ask for.
 *
 * `sizes` only decides which srcset candidate the browser downloads, never the
 * layout, so overstating it buys resolution headroom and nothing else.
 *
 * Without it a tile at two images per row asks for exactly what it draws — 1080
 * real pixels on a retina screen — and the route hands back a lossy q90
 * downscale of a 1641px capture rendered at 1:1, with nothing in reserve. That
 * is the whole reason these read softer than the trade charts, which are served
 * untouched at capture resolution and downscaled by the browser.
 *
 * At 1.4 the same tile asks for 1920, gets the 1641px original back losslessly
 * (nothing to resize below its own width) and lets the browser do the reduction
 * — the trade-chart path exactly. Measured over 28 stored captures: 80KB per
 * image at 1080, 123KB at 1920.
 */
const OVERSAMPLE = 1.4;

type NoteRecord = {
  id: string;
  parentId: string | null;
  title: string;
  order: number;
  uncategorizedCollapsed: boolean;
};

type BlockRecord = { id: string; noteId: string; categoryId: string | null; exampleId: string | null; type: string; content: string | null; order: number };

// Confirmations and invalid reasons are meant to repeat: the same handful of
// words describes example after example. So every value already written on any
// example becomes a suggestion offered under the input of every other one —
// typed once, picked from a list from then on. The vocabulary is derived from
// the examples the page was given rather than stored in a table of its own: a
// word exists exactly as long as some example still carries it.
type TagKind = "confirmation" | "invalidReason" | "tradeType";

type TagVocabulary = {
  values: (kind: TagKind) => string[];
  // Keeps a value that was just typed in the list without waiting for the page
  // data to come back, so it can be reused on the next example straight away.
  remember: (kind: TagKind, value: string) => void;
};

const TagVocabularyContext = createContext<TagVocabulary>({ values: () => [], remember: () => {} });

// Most-used first, then alphabetical — the words that describe half the journal
// should not sit behind the one written once, and ties should not shuffle
// between renders.
function rankTagValues(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  headings: "Titre",
  objectif: "Encadré",
  theorie: "Texte",
  regles: "Liste numérotée",
  retenir: "Liste à puces",
  invalide: "Invalid",
  exemples: "Exemples",
};

type CategoryRecord = { id: string; noteId: string; name: string; order: number; collapsed: boolean };
type ExampleRecord = { id: string; noteId: string; categoryId: string | null; title: string; caption: string | null; tags: string | null; hideText: boolean; imagesPerRow: number; confirmations: string | null; validity: string | null; invalidReasons: string | null; zone: string | null; tradeTypes: string | null; order: number; collapsed: boolean };
type ImageRecord = { id: string; exampleId: string; url: string; caption: string | null; tradeId: string | null; order: number; width: number | null; height: number | null };
type TradeSearchResult = { id: string; symbol: string; date: string; setup: string; side: string; pnl: number; imageCount: number };

function parseArr(s: string | null): string[] {
  if (!s) return [];
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

// Captions predate the multi-bullet format and were stored as plain text —
// falling back to a single-item list keeps those readable instead of blanking
// them out the first time this parses their content.
function parseCaptionBullets(s: string | null): string[] {
  if (!s) return [""];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // Not JSON: pre-existing plain-text caption.
  }
  return [s];
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
        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.5 0.034 250)", borderRadius: 5, cursor: onDragStart ? "grab" : "pointer" }}
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
            background: "oklch(0.21 0.034 250)",
            border: "1px solid oklch(0.34 0.034 250)",
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
          color: "oklch(0.5 0.034 250)",
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

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="4.6" y="1.6" width="7.8" height="7.8" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M9.4 12.4H3.2a1.6 1.6 0 0 1-1.6-1.6V4.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function MoreMenuButton({
  onDuplicate,
  onDelete,
  visible,
}: {
  onDuplicate?: () => void;
  onDelete: () => void;
  visible: boolean;
}) {
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
        style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, letterSpacing: "-1px", color: "oklch(0.55 0.034 250)", borderRadius: 6, cursor: "pointer" }}
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
            background: "oklch(0.21 0.034 250)",
            border: "1px solid oklch(0.34 0.034 250)",
            borderRadius: 8,
            boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
            padding: 4,
            minWidth: 150,
          }}
        >
          {onDuplicate && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDuplicate();
              }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", fontSize: 13, color: "oklch(0.8 0.02 250)", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <CopyIcon /> Dupliquer
            </span>
          )}
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
  initialCollapsedNotes,
}: {
  notes: NoteRecord[];
  blocks: BlockRecord[];
  categories: CategoryRecord[];
  examples: ExampleRecord[];
  images: ImageRecord[];
  initialCollapsedNotes: string[];
}) {
  const router = useRouter();
  const treeNodes = useMemo(() => buildTree(notes), [notes]);
  const flat = useMemo(() => flattenDFS(treeNodes), [treeNodes]);
  const [collapsedNotes, setCollapsedNotes] = useState<Set<string>>(() => {
    if (initialCollapsedNotes.length > 0) return new Set(initialCollapsedNotes);
    try {
      const raw = localStorage.getItem("collapsed-notes");
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  });

  useEffect(() => {
    const arr = [...collapsedNotes];
    try {
      document.cookie = `collapsed-notes=${encodeURIComponent(JSON.stringify(arr))}; path=/; max-age=${60 * 60 * 24 * 365}`;
    } catch {}
    try {
      localStorage.setItem("collapsed-notes", JSON.stringify(arr));
    } catch {}
  }, [collapsedNotes]);

  function toggleNote(noteId: string) {
    setCollapsedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }

  // Words typed since the page was loaded. They are already stored on their own
  // example, but the `examples` prop only catches up on the next refresh, and a
  // confirmation should be reusable on the example right below immediately.
  const [freshTags, setFreshTags] = useState<Record<TagKind, string[]>>({
    confirmation: [],
    invalidReason: [],
    tradeType: [],
  });

  const vocabulary = useMemo<TagVocabulary>(() => {
    const count = (pick: (e: ExampleRecord) => string | null, fresh: string[]) => {
      const counts = new Map<string, number>();
      for (const value of [...examples.flatMap((e) => parseArr(pick(e))), ...fresh]) {
        const v = value.trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return rankTagValues(counts);
    };
    const ranked: Record<TagKind, string[]> = {
      confirmation: count((e) => e.confirmations, freshTags.confirmation),
      invalidReason: count((e) => e.invalidReasons, freshTags.invalidReason),
      // The five that ship with the app always sit at the head of the list,
      // whether or not any example uses them yet; anything added since follows.
      tradeType: [
        ...TRADE_TYPES,
        ...count((e) => e.tradeTypes, freshTags.tradeType).filter(
          (t) => !(TRADE_TYPES as readonly string[]).includes(t)
        ),
      ],
    };
    return {
      values: (kind) => ranked[kind],
      remember: (kind, value) =>
        setFreshTags((prev) => (prev[kind].includes(value) ? prev : { ...prev, [kind]: [...prev[kind], value] })),
    };
  }, [examples, freshTags]);

  return (
    <TagVocabularyContext.Provider value={vocabulary}>
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
            collapsed={collapsedNotes.has(node.id)}
            onToggleCollapse={() => toggleNote(node.id)}
          />
        ))}
      </div>
    </div>
    </TagVocabularyContext.Provider>
  );
}

function NoteSection({
  note,
  blocks,
  categories,
  examples,
  images,
  onChanged,
  collapsed,
  onToggleCollapse,
}: {
  note: NoteRecord;
  blocks: BlockRecord[];
  categories: CategoryRecord[];
  examples: ExampleRecord[];
  images: ImageRecord[];
  onChanged: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
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
    <div data-note-section={note.id} id={"note-" + note.id} style={{ paddingBottom: 48, marginBottom: 40, borderBottom: "1px solid oklch(0.22 0.034 250)" }}>
      <div style={{ maxWidth: TEXT_WIDTH }}>
        <div
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
          style={{ display: "flex", alignItems: "center", marginBottom: 20 }}
        >
          <div
            onClick={onToggleCollapse}
            style={{ width: "var(--note-indent)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ChevronIcon color="oklch(0.5 0.034 250)" down={!collapsed} />
          </div>
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
              color: "oklch(0.96 0.0068 250)",
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

      {!collapsed && blockList.filter((block) => !block.categoryId && block.type !== "exemples").map((block) => {
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

      {blockList.filter((block) => !block.categoryId && block.type === "exemples").map((block) => {
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
                    {categories.map((cat, catIdx) => (
                      <div
                        key={cat.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", cat.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const dragId = e.dataTransfer.getData("text/plain");
                          if (!dragId || dragId === cat.id) return;
                          const current = categories.map((c) => c.id);
                          const dragIdx = current.indexOf(dragId);
                          const targetIdx = current.indexOf(cat.id);
                          if (dragIdx === -1 || targetIdx === -1) return;
                          current.splice(dragIdx, 1);
                          current.splice(targetIdx, 0, dragId);
                          reorderCategories(current);
                          onChanged();
                        }}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <ExampleCategory
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
                            categoryId={cat.id}
                            // Passed for the move menu. The fold still keys off
                            // categoryId, which takes precedence over it.
                            noteId={note.id}
                            initialCollapsed={cat.collapsed}
                            onMoveUp={catIdx > 0 ? async () => {
                              const next = [...categories];
                              [next[catIdx - 1], next[catIdx]] = [next[catIdx], next[catIdx - 1]];
                              await reorderCategories(next.map((c) => c.id));
                              onChanged();
                            } : undefined}
                            onMoveDown={catIdx < categories.length - 1 ? async () => {
                              const next = [...categories];
                              [next[catIdx], next[catIdx + 1]] = [next[catIdx + 1], next[catIdx]];
                              await reorderCategories(next.map((c) => c.id));
                              onChanged();
                            } : undefined}
                            canMoveUp={catIdx > 0}
                            canMoveDown={catIdx < categories.length - 1}
                          />
                        </div>
                      </div>
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
                        noteId={note.id}
                        initialCollapsed={note.uncategorizedCollapsed}
                      />
                    )}
                  </div>
                </div>
            </DraggableBlock>
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
            style={{ position: "relative", marginTop: 32, marginLeft: "var(--note-indent)", maxWidth: TEXT_WIDTH, height: 22 }}
          >
            <span
              onClick={() => {
                setAddLineText("/");
                addLineInputRef.current?.focus();
              }}
              title="Ajouter une section"
              style={{
                position: "absolute",
                left: "calc(var(--handle-offset) - 4px)",
                top: -3,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                color: "oklch(0.5 0.034 250)",
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
                color: "oklch(0.88 0.017 250)",
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
                  background: "oklch(0.21 0.034 250)",
                  border: "1px solid oklch(0.34 0.034 250)",
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
      return <BulletListBlock blockId={block.id} initialContent={block.content} icon="check" iconColor={accentColor} indent={indent} />;
    case "invalide":
      return <BulletListBlock blockId={block.id} initialContent={block.content} icon="cross" iconColor={lossColor} indent={indent} />;
    default:
      return null;
  }
}


/**
 * The markers the note blocks are built from.
 *
 * Shapes rather than characters: a "✓" in a box is whatever glyph the font
 * happens to carry, at whatever weight, and it never quite lines up. Drawn, it
 * matches the rest of the interface — cut corners, a hairline, and the glow the
 * page is lit by.
 */
function ListMarker({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        flex: "none",
        marginTop: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tone,
        border: `1px solid ${tone.replace(")", " / 0.55)")}`,
        background: tone.replace(")", " / 0.12)"),
        boxShadow: `0 0 10px -3px ${tone.replace(")", " / 0.8)")}`,
        // The bevel every panel in the app carries, at the size of a bullet.
        clipPath: "polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)",
      }}
    >
      {children}
    </span>
  );
}

function CheckMark({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2.2 6.4 4.7 8.9 9.8 3.4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossMark({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** The step number of a numbered list, as a plate rather than a bare digit. */
function StepBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 11,
        fontWeight: 700,
        flex: "none",
        minWidth: 26,
        padding: "3px 0",
        textAlign: "center",
        color: accentColor,
        border: "1px solid oklch(0.84 0.17 196 / 0.4)",
        background: "oklch(0.84 0.17 196 / 0.1)",
        boxShadow: "0 0 12px -4px oklch(0.84 0.17 196 / 0.8)",
        clipPath: "polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)",
      }}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

function HeadingsBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const [headings, setHeadings] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, marginBottom: 32, marginLeft: indentCss(indent) }}>
      {headings.map((h, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: accentColor, fontSize: 13, flex: "none", letterSpacing: "-2px" }}>▚▚</span>
        <input
          ref={(el) => { refs.current[i] = el; }}
          value={h}
          onChange={(e) => setHeadings((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
          onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(headings))}
          onKeyDown={(e) => handleListKeyDown(e, i, headings, (next) => { setHeadings(next); updateNoteBlockContent(blockId, JSON.stringify(next)); }, refs, { allowEnter: true })}
          style={{ flex: 1, fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", color: "oklch(0.94 0.0068 250)", background: "transparent", border: "none", outline: "none" }}
        />
        <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, oklch(0.84 0.17 196 / 0.35), transparent)" }} />
        </div>
      ))}
    </div>
  );
}

function ObjectifBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const [objectif, setObjectif] = useState(initialContent ?? "");
  return (
    <div style={{ position: "relative", marginLeft: indentCss(indent), marginBottom: 24 }}>
      {/* The panel says what it is on its own edge, the way a console labels a
          readout — one word, in the accent, where a heading would cost a line. */}
      <span
        style={{
          position: "absolute",
          top: -7,
          left: 14,
          zIndex: 1,
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 9,
          letterSpacing: "0.14em",
          padding: "1px 7px",
          color: accentColor,
          background: "oklch(0.11 0.025 255)",
          border: "1px solid oklch(0.84 0.17 196 / 0.35)",
        }}
      >
        OBJECTIF
      </span>
      <div
        style={{
          border: `1px solid oklch(0.84 0.17 196 / 0.35)`,
          background: "oklch(0.84 0.17 196 / 0.06)",
          boxShadow: "inset 0 0 24px -14px oklch(0.84 0.17 196 / 0.9)",
          clipPath: "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
          padding: "18px 18px 15px",
        }}
      >
      <textarea
        ref={(el) => autoGrow(el)}
        value={objectif}
        onChange={(e) => setObjectif(e.target.value)}
        onBlur={() => updateNoteBlockContent(blockId, objectif)}
        rows={1}
        style={{ width: "100%", boxSizing: "border-box", fontSize: 15, lineHeight: 1.6, color: "oklch(0.92 0.034 250)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", fontFamily: "inherit" }}
      />
      </div>
    </div>
  );
}

function TheorieBlock({ blockId, initialContent, indent = HEADER_INDENT }: { blockId: string; initialContent: string | null; indent?: number }) {
  const [theorie, setTheorie] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  return (
    // A rail rather than a box: the paragraphs are the block, and a border all
    // the way round them would make them look like something to click.
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        marginTop: 12,
        marginBottom: 32,
        marginLeft: indentCss(indent),
        paddingLeft: 16,
        borderLeft: "1px solid oklch(0.84 0.17 196 / 0.22)",
      }}
    >
      {theorie.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={(el) => { refs.current[i] = el; autoGrow(el); }}
            value={p}
            onChange={(e) => setTheorie((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
            onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(theorie))}
            onKeyDown={(e) => handleListKeyDown(e, i, theorie, (next) => { setTheorie(next); updateNoteBlockContent(blockId, JSON.stringify(next)); }, refs)}
            rows={1}
            style={{ flex: 1, fontSize: 15, lineHeight: 1.72, color: "oklch(0.84 0.034 250)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", fontFamily: "inherit" }}
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
  indent = HEADER_INDENT,
}: {
  blockId: string;
  initialContent: string | null;
  icon: "check" | "cross";
  iconColor: string;
  indent?: number;
}) {
  const [items, setItems] = useState<string[]>(parseArr(initialContent));
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12, marginBottom: 32, marginLeft: indentCss(indent) }}>
      {items.map((k, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <ListMarker tone={iconColor}>
            {icon === "check" ? <CheckMark color={iconColor} /> : <CrossMark color={iconColor} />}
          </ListMarker>
          <textarea
            ref={(el) => { refs.current[i] = el; autoGrow(el); }}
            value={k}
            onChange={(e) => setItems((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
            onBlur={() => updateNoteBlockContent(blockId, JSON.stringify(items))}
            onKeyDown={(e) => handleListKeyDown(e, i, items, (next) => { setItems(next); updateNoteBlockContent(blockId, JSON.stringify(next)); }, refs, { allowEnter: true })}
            rows={1}
            style={{ flex: 1, fontSize: 14.5, lineHeight: 1.5, color: "oklch(0.86 0.034 250)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", overflowWrap: "anywhere", fontFamily: "inherit" }}
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
      style={{ position: "relative", marginTop: 12, marginBottom: 32, marginLeft: indentCss(indent) }}
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
          style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: "oklch(0.7 0.034 250)", background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "inherit" }}
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
            border: "1px dashed oklch(0.34 0.034 250)",
            color: "oklch(0.6 0.034 250)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            opacity: hover ? 1 : 0,
            transition: "opacity 0.12s ease",
          }}
        >
          + titre
        </span>
      )}
      <div
        style={{
          border: "1px solid oklch(0.84 0.17 196 / 0.18)",
          background: "oklch(0.16 0.03 250 / 0.5)",
          boxShadow: "inset 0 0 0 1px oklch(0.84 0.17 196 / 0.04)",
          clipPath: "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
        }}
      >
      {regles.map((r, i) => (
        <div
          key={i}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
          style={{
            padding: "13px 18px",
            background: hoverIdx === i ? "oklch(0.84 0.17 196 / 0.05)" : "transparent",
            boxShadow: hoverIdx === i ? "inset 2px 0 0 oklch(0.84 0.17 196 / 0.7)" : "none",
            borderBottom: i < regles.length - 1 ? "1px solid oklch(0.84 0.17 196 / 0.12)" : "none",
            transition: "background 0.12s ease, box-shadow 0.12s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
            <StepBadge n={i + 1} />
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
              style={{ flex: 1, fontSize: 14.5, lineHeight: 1.6, color: "oklch(0.86 0.034 250)", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", overflowWrap: "anywhere", fontFamily: "inherit" }}
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
              <ListMarker tone={accentColor}>
                <CheckMark color={accentColor} />
              </ListMarker>
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
                  color: "oklch(0.68 0.034 250)",
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
              color: "oklch(0.5 0.034 250)",
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
        style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, padding: "3px 10px", borderRadius: 999, border: "1px dashed oklch(0.34 0.034 250)", color: "oklch(0.6 0.034 250)", cursor: "pointer" }}
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
            background: "oklch(0.21 0.034 250)",
            border: "1px solid oklch(0.34 0.034 250)",
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
              style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: "oklch(0.85 0.034 250)", whiteSpace: "nowrap" }}
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
          color: "oklch(0.55 0.034 250)",
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

// One row of the category filter: every value its examples carry, each chip a
// toggle. A row with nothing in it draws nothing — a category where no reason
// was ever written should not show an empty "Invalid reason:" line.
function FilterRow({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!values.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, color: "oklch(0.55 0.034 250)" }}>{label}</span>
      {values.map((v) => (
        <FilterChip key={v} label={v} tone={tagTone(v)} on={selected.includes(v)} onClick={() => onToggle(v)} />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  tone,
  on,
  onClick,
}: {
  label: string;
  tone: { fg: string; bg: string; line: string };
  on: boolean;
  onClick: () => void;
}) {
  return (
    <span
      onClick={onClick}
      style={{
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 10,
        padding: "3px 9px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${on ? tone.line : "oklch(0.32 0.034 250)"}`,
        background: on ? tone.bg : "transparent",
        color: on ? tone.fg : "oklch(0.58 0.034 250)",
      }}
    >
      {label}
    </span>
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
  categoryId,
  noteId,
  initialCollapsed = false,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
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
  categoryId?: string;
  noteId?: string;
  initialCollapsed?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const [name, setName] = useState(title);
  const [hover, setHover] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Filtering happens here rather than on the note as a whole: a category is
  // the pile you actually read through, and the words worth filtering by are
  // the ones its own examples carry. Values that appear nowhere in this
  // category are not offered — a filter that can only ever empty the list is
  // not a filter.
  const [filterOpen, setFilterOpen] = useState(false);
  const [confirmationFilter, setConfirmationFilter] = useState<string[]>([]);
  const [validityFilter, setValidityFilter] = useState<Validity>(null);
  const [reasonFilter, setReasonFilter] = useState<string[]>([]);
  const [zoneFilter, setZoneFilter] = useState<Zone>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const available = useMemo(() => {
    const collect = (pick: (e: ExampleRecord) => string | null) => {
      const counts = new Map<string, number>();
      for (const value of examples.flatMap((e) => parseArr(pick(e)))) {
        const v = value.trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return rankTagValues(counts);
    };
    return {
      confirmations: collect((e) => e.confirmations),
      reasons: collect((e) => e.invalidReasons),
      hasValidity: examples.some((e) => normalizeValidity(e.validity) !== null),
      hasZone: examples.some((e) => normalizeZone(e.zone) !== null),
      // Only the types this category actually uses: the five that ship with the
      // app first, in the order they are declared, then anything added since.
      types: (() => {
        const used = new Set(examples.flatMap((e) => parseArr(e.tradeTypes)));
        const shipped = TRADE_TYPES.filter((t) => used.has(t));
        return [...shipped, ...[...used].filter((t) => !(TRADE_TYPES as readonly string[]).includes(t)).sort()];
      })(),
    };
  }, [examples]);

  const filtering =
    confirmationFilter.length > 0 ||
    validityFilter !== null ||
    reasonFilter.length > 0 ||
    zoneFilter !== null ||
    typeFilter.length > 0;

  // Every selected chip has to match, across the three rows and within each of
  // them: picking two confirmations asks for the examples that showed both, not
  // for either one.
  const shown = useMemo(() => {
    if (!filtering) return examples;
    return examples.filter((e) => {
      const confirmations = parseArr(e.confirmations);
      const reasons = parseArr(e.invalidReasons);
      return (
        confirmationFilter.every((v) => confirmations.includes(v)) &&
        (validityFilter === null || normalizeValidity(e.validity) === validityFilter) &&
        (zoneFilter === null || normalizeZone(e.zone) === zoneFilter) &&
        typeFilter.every((t) => parseArr(e.tradeTypes).includes(t)) &&
        reasonFilter.every((v) => reasons.includes(v))
      );
    });
  }, [examples, filtering, confirmationFilter, validityFilter, reasonFilter, zoneFilter, typeFilter]);

  const clearFilter = () => {
    setConfirmationFilter([]);
    setValidityFilter(null);
    setReasonFilter([]);
    setZoneFilter(null);
    setTypeFilter([]);
  };

  const toggleIn = (list: string[], set: (next: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const hasAnythingToFilter =
    available.confirmations.length > 0 ||
    available.reasons.length > 0 ||
    available.hasValidity ||
    available.hasZone ||
    available.types.length > 0;

  // As for the examples: the fold comes from the server so the first paint is
  // right, and the click writes it back without revalidating.
  const setCollapsedPersist = (fn: (c: boolean) => boolean) => {
    setCollapsed((c) => {
      const next = fn(c);
      if (categoryId) setCategoryCollapsed(categoryId, next);
      else if (noteId) setUncategorizedCollapsed(noteId, next);
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
          <ChevronIcon color="oklch(0.5 0.034 250)" down={!collapsed} />
        </span>
        {onRename ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onRename(name)}
            style={{ fontSize: 14, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: "oklch(0.92 0.0085 250)", padding: "2px 4px", marginLeft: -4, width: `${Math.max(name.length + 2, 6)}ch`, minWidth: 0 }}
          />
        ) : (
          <span onClick={() => setCollapsedPersist((c) => !c)} style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.7 0.034 250)", cursor: "pointer" }}>
            {title}
          </span>
        )}
        <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, color: "oklch(0.5 0.034 250)" }}>
          {filtering ? `${shown.length}/${examples.length}` : examples.length}
        </span>
        {hasAnythingToFilter && (
          <span
            onClick={() => setFilterOpen((f) => !f)}
            title="Filtrer les exemples"
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${filtering ? "oklch(0.84 0.17 196 / 0.5)" : "oklch(0.34 0.034 250)"}`,
              background: filtering ? "oklch(0.84 0.17 196 / 0.16)" : "transparent",
              color: filtering ? accentColor : "oklch(0.55 0.034 250)",
              // Out of the way until the row is hovered, unless a filter is on:
              // a list showing a subset must say so even when nothing is hovered.
              opacity: hover || filtering || filterOpen ? 1 : 0,
              transition: "opacity 0.12s ease",
            }}
          >
            filtre
          </span>
        )}
        {filtering && (
          <span
            onClick={clearFilter}
            title="Retirer le filtre"
            style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, color: "oklch(0.55 0.034 250)", cursor: "pointer" }}
          >
            ✕
          </span>
        )}
        {onMoveUp && (
          <span
            onClick={onMoveUp}
            title="Monter"
            style={{ width: 18, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: canMoveUp ? "pointer" : "default", opacity: canMoveUp ? 1 : 0.25, color: "oklch(0.55 0.034 250)", transform: "rotate(-90deg)" }}
          >
            <ChevronIcon color="currentColor" down={false} />
          </span>
        )}
        {onMoveDown && (
          <span
            onClick={onMoveDown}
            title="Descendre"
            style={{ width: 18, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: canMoveDown ? "pointer" : "default", opacity: canMoveDown ? 1 : 0.25, color: "oklch(0.55 0.034 250)" }}
          >
            <ChevronIcon color="currentColor" down={true} />
          </span>
        )}
        {categoryId && noteId && (
          <MoveCategoryMenu categoryId={categoryId} currentNoteId={noteId} visible={hover} onMoved={onChanged} />
        )}
        {onAddBlock && <AddBlockButton visible={hover} onAdd={onAddBlock} />}
      </div>
      {!collapsed && filterOpen && hasAnythingToFilter && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: "var(--note-indent)", marginBottom: 14 }}>
          <FilterRow
            label="Confirmation:"
            values={available.confirmations}
            selected={confirmationFilter}
            onToggle={(v) => toggleIn(confirmationFilter, setConfirmationFilter, v)}
          />
          <FilterRow
            label="Type:"
            values={[...available.types]}
            selected={typeFilter}
            onToggle={(v) => toggleIn(typeFilter, setTypeFilter, v)}
          />
          {available.hasZone && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, color: "oklch(0.55 0.02 250)" }}>Zone:</span>
              {ZONES.map(([key, text]) => (
                <FilterChip
                  key={key}
                  label={text}
                  tone={tagTone(text)}
                  on={zoneFilter === key}
                  onClick={() => setZoneFilter(zoneFilter === key ? null : key)}
                />
              ))}
            </div>
          )}
          {available.hasValidity && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, color: "oklch(0.55 0.034 250)" }}>Verdict:</span>
              {VERDICTS.map(([side, text, tone]) => (
                <FilterChip
                  key={side}
                  label={text}
                  tone={tone}
                  on={validityFilter === side}
                  onClick={() => setValidityFilter(validityFilter === side ? null : side)}
                />
              ))}
            </div>
          )}
          <FilterRow
            label="Invalid reason:"
            values={available.reasons}
            selected={reasonFilter}
            onToggle={(v) => toggleIn(reasonFilter, setReasonFilter, v)}
          />
        </div>
      )}
      {!collapsed && blocks && blocks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
          {blocks.map((b) => (
            <CategoryBlock key={b.id} block={b} onDelete={() => onDeleteBlock?.(b.id)} />
          ))}
        </div>
      )}
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginLeft: "var(--note-indent)" }}>
          {shown.length === 0 && (
            <div style={{ fontSize: 13, color: "oklch(0.5 0.034 250)" }}>
              {filtering ? "Aucun exemple ne correspond au filtre." : "Aucun exemple."}
            </div>
          )}
          {shown.map((ex) => {
            // Reordering moves an example among all of them, not among the ones
            // currently on screen, so the position comes from the full list —
            // and the arrows are gone while a filter is on, where "up" would
            // mean stepping over examples the filter is hiding.
            const exIdx = examples.indexOf(ex);
            return (
              <div key={ex.id} style={{ display: "flex", gap: 8 }}>
                {!filtering && (
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
                    style={{ width: 18, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: exIdx === 0 ? "default" : "pointer", opacity: exIdx === 0 ? 0.25 : 1, color: "oklch(0.55 0.034 250)", transform: "rotate(-90deg)" }}
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
                    style={{ width: 18, height: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: exIdx === examples.length - 1 ? "default" : "pointer", opacity: exIdx === examples.length - 1 ? 0.25 : 1, color: "oklch(0.55 0.034 250)" }}
                  >
                    <ChevronIcon color="currentColor" down={true} />
                  </span>
                </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ExampleCard
                    example={ex}
                    images={images.filter((i) => i.exampleId === ex.id)}
                    blocks={(exampleBlocks ?? []).filter((b) => b.exampleId === ex.id)}
                    onChanged={onChanged}
                  />
                </div>
              </div>
            );
          })}
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
              border: "1px dashed oklch(0.34 0.034 250)",
              color: "oklch(0.6 0.034 250)",
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

function ExampleImage({
  img,
  onOpen,
  onRemove,
  imagesPerRow,
  pending = false,
}: {
  img: ImageRecord;
  onOpen: () => void;
  onRemove: () => void;
  imagesPerRow: number;
  pending?: boolean;
}) {
  const [bullets, setBullets] = useState<string[]>(() => parseCaptionBullets(img.caption));
  const bulletRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const saveBullets = (next: string[]) => updateExampleImageCaption(img.id, JSON.stringify(next));
  const hasCaption = bullets.some((b) => b.trim());
  const [hover, setHover] = useState(false);
  // Screenshots are stored at their capture resolution — 1600 to 3200px wide —
  // but a thumbnail is only ever a few hundred pixels.
  //
  // The resizing is asked of our own route rather than of next/image: the
  // built-in optimizer fetches the source over HTTP forwarding no headers, so
  // behind the session proxy it only ever gets a 401. `loader` keeps everything
  // else next/image does — srcset, sizes, lazy loading — and only changes the
  // URL those point at.
  //
  // Images imported from a trade still point at the old external host, which
  // knows nothing of `?w=`; serve those untouched rather than break them.
  const isLocal = img.url.startsWith("/");
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {/* No row exists to attach a caption to until the upload lands. */}
      {!pending && (hasCaption || hover) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            marginTop: 12,
            marginBottom: 12,
            padding: "7px 10px",
            borderRadius: 8,
            background: "oklch(0.84 0.17 196 / 0.09)",
            border: `1px solid ${accentColor}33`,
          }}
        >
          {bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span
                style={{
                  flex: "none",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: accentColor,
                  marginTop: 8,
                }}
              />
              <textarea
                ref={(el) => {
                  bulletRefs.current[i] = el;
                  autoGrow(el);
                }}
                value={b}
                onChange={(e) => setBullets((arr) => arr.map((x, xi) => (xi === i ? e.target.value : x)))}
                onBlur={() => saveBullets(bullets)}
                onKeyDown={(e) => handleListKeyDown(e, i, bullets, (next) => { setBullets(next); saveBullets(next); }, bulletRefs, { allowEnter: true })}
                placeholder="Légende de l'image"
                rows={1}
                style={{
                  display: "block",
                  flex: 1,
                  minWidth: 0,
                  boxSizing: "border-box",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "oklch(0.92 0.0068 250)",
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
            </div>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <Image
          src={img.url}
          alt={bullets.filter((b) => b.trim()).join(" · ")}
          // Chart captures are all shapes — 123 of the 226 stored are wider than
          // 16/9, out to 2.81:1. A fixed 16/9 box with `cover` cropped the sides
          // off every one of them, so the tile takes the height the image asks
          // for instead: `width: 100%` with `height: auto`, per the responsive
          // recipe in the next/image docs.
          //
          // The stored dimensions are handed over whenever they are known, not
          // to size the tile — the style below overrides both — but so that
          // next/image can reserve the height from the ratio before the image
          // arrives. Without them the tile is zero-high until it loads, the page
          // grows under the reader, and a click in the sidebar lands on whatever
          // section slid into place meanwhile.
          //
          // Falling back to the zeroes of the responsive recipe covers what
          // cannot be measured: base44 charts, and rows the backfill has not
          // reached yet. Those tiles behave as they did before.
          width={img.width ?? 0}
          height={img.height ?? 0}
          unoptimized={!isLocal}
          loader={isLocal ? ({ src, width }) => `${src}?w=${width}` : undefined}
          sizes={
            imagesPerRow === 1
              ? `(max-width: 900px) ${100 * OVERSAMPLE}vw, ${Math.round(TILE_WIDTH[1] * OVERSAMPLE)}px`
              : `(max-width: 900px) ${50 * OVERSAMPLE}vw, ${Math.round(TILE_WIDTH[2] * OVERSAMPLE)}px`
          }
          onClick={pending ? undefined : onOpen}
          style={{
            // A tile always fills its column, even when the capture holds fewer
            // pixels than that and has to be stretched to get there. Capping at
            // the native size was tried and dropped: it left 69 of the 224
            // stored images drawn narrower than their tile, down to 285px, and
            // an even grid is worth more than the sharpness of the few small
            // captures. `sizes` asking for OVERSAMPLE above the tile is what
            // carries the sharpness now.
            width: "100%",
            height: "auto",
            // Without this the img sits on the text baseline and leaves a few
            // stray pixels under every tile.
            display: "block",
            borderRadius: 8,
            border: "1px solid oklch(0.32 0.034 250 / 0.5)",
            cursor: pending ? "progress" : "zoom-in",
            opacity: pending ? 0.55 : 1,
            transition: "opacity 0.2s",
          }}
        />
        {pending && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 10.5,
              letterSpacing: 0.3,
              color: "oklch(0.9 0.0085 250)",
              pointerEvents: "none",
            }}
          >
            envoi…
          </div>
        )}
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
              background: "oklch(0.15 0.034 250 / 0.75)",
              color: "oklch(0.85 0.034 250)",
            }}
          >
            Trade ↗
          </Link>
        )}
        {!pending && (
          <div
            onClick={onRemove}
            style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, borderRadius: 6, background: "oklch(0.15 0.034 250 / 0.75)", color: "oklch(0.9 0.0085 250)", cursor: "pointer" }}
          >
            ✕
          </div>
        )}
      </div>
    </div>
  );
}

type Validity = "valid" | "invalid" | "risk" | null;

// Valide and Invalid keep the page's two existing accents — the violet used for
// wins, and the red already used for losses and errors — each with the soft
// fill and hairline that the chips are drawn with.
const VALID_TONE = { fg: accentColor, bg: "oklch(0.84 0.17 196 / 0.16)", line: "oklch(0.84 0.17 196 / 0.5)" };
const INVALID_TONE = { fg: lossColor, bg: "oklch(0.7 0.25 18 / 0.14)", line: "oklch(0.7 0.25 18 / 0.45)" };
// Amber, the third light: neither the cyan of a setup that worked nor the
// magenta of one that did not — a trade that was taken and should not have been.
const RISK_TONE = { fg: "oklch(0.82 0.16 78)", bg: "oklch(0.82 0.16 78 / 0.14)", line: "oklch(0.82 0.16 78 / 0.45)" };

function normalizeValidity(s: string | null): Validity {
  return s === "valid" || s === "invalid" || s === "risk" ? s : null;
}

/**
 * A colour per tag, the same one everywhere.
 *
 * Twelve chips in one row all lit the same way are a wall of text; given their
 * own hue they become recognisable at a glance, and the eye can follow one
 * confirmation from example to example. The hue comes from the word itself, so
 * a tag keeps its colour across cards, across filters, and across reloads
 * without anything being stored — and two tags that collide simply share, which
 * costs nothing.
 */
const TAG_HUES = [196, 165, 78, 300, 340, 250, 130, 30, 220, 55];

function tagTone(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  const hue = TAG_HUES[hash % TAG_HUES.length];
  return {
    fg: `oklch(0.84 0.15 ${hue})`,
    bg: `oklch(0.84 0.15 ${hue} / 0.14)`,
    line: `oklch(0.84 0.15 ${hue} / 0.45)`,
  };
}

/**
 * What the trade was. Several can be true of the same trade — a rebound inside
 * a range taken against the trend is all three at once — so these are ticked,
 * not picked, and the list is fixed: it is a vocabulary, not free text.
 */
const TRADE_TYPES = [
  "Rebond sur range",
  "Trend",
  "Range",
  "Contre la tendance",
  "Revient dans la VA / VWAP & Rebondit",
] as const;

/**
 * The kind of zone the trade was taken on — one of a fixed pair, since it is
 * the same question asked of every example. Their colours come from the tag
 * palette so they sit naturally among the chips beside them.
 */
type Zone = "retournement" | "stunden" | null;

const ZONES: [Exclude<Zone, null>, string][] = [
  ["retournement", "Zone de retournement"],
  ["stunden", "Stunden Cluster"],
];

function normalizeZone(s: string | null): Zone {
  return s === "retournement" || s === "stunden" ? s : null;
}

const VERDICTS: [Exclude<Validity, null>, string, typeof VALID_TONE][] = [
  ["valid", "Valide", VALID_TONE],
  ["invalid", "Invalid", INVALID_TONE],
  ["risk", "Risque", RISK_TONE],
];

// The chip rows an example carries under its title: the confirmations that were
// present, and — once it is marked invalid — the reasons why. Both lists are
// free text the reader types themselves, so there is no preset vocabulary here.
// The input commits on Enter and on blur, the way the tag input in
// AddTradeToNoteButton already does.
function ChipList({
  label,
  values,
  kind,
  tone,
  tonePerValue,
  placeholder,
  visible,
  onChange,
}: {
  label?: string;
  values: string[];
  kind: TagKind;
  /** Fallback tone, used for the input and for anything not coloured per value. */
  tone: { fg: string; bg: string; line: string };
  /** When set, every chip takes the colour of the word it carries. */
  tonePerValue?: boolean;
  placeholder: string;
  visible: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const vocabulary = useContext(TagVocabularyContext);

  const add = (value: string) => {
    const v = value.trim();
    if (!v || values.includes(v)) return;
    vocabulary.remember(kind, v);
    onChange([...values, v]);
  };
  const commit = () => {
    add(draft);
    setDraft("");
  };

  // What has been written elsewhere and is not already on this example. The
  // draft narrows it as it is typed, so the input is both a filter over the
  // known words and the way to write a new one.
  const query = draft.trim().toLowerCase();
  const suggestions = vocabulary
    .values(kind)
    .filter((v) => !values.includes(v) && v.toLowerCase().includes(query))
    .slice(0, 8);

  // Nothing written yet and the pointer is elsewhere: the row would be a lone
  // label, so it stays out of the card until the header is hovered.
  if (!values.length && !visible) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, color: "oklch(0.55 0.034 250)" }}>{label}</span>
      {values.map((v, i) => {
        const chipTone = tonePerValue ? tagTone(v) : tone;
        return (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: 10,
            padding: "3px 6px 3px 9px",
            borderRadius: 999,
            background: chipTone.bg,
            border: `1px solid ${chipTone.line}`,
            color: chipTone.fg,
          }}
        >
          {v}
          <span onClick={() => onChange(values.filter((_, xi) => xi !== i))} style={{ cursor: "pointer", fontSize: 11, opacity: 0.7 }}>
            ✕
          </span>
        </span>
        );
      })}
      {visible && (
        <span style={{ position: "relative", display: "inline-flex" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setPicking(true)}
            onBlur={() => {
              setPicking(false);
              commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft("");
                setPicking(false);
              }
            }}
            placeholder={placeholder}
            style={{
              width: 130,
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px dashed oklch(0.34 0.034 250)",
              background: "transparent",
              color: "oklch(0.8 0.034 250)",
              outline: "none",
            }}
          />
          {picking && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                zIndex: 30,
                minWidth: 150,
                maxHeight: 200,
                overflowY: "auto",
                padding: 4,
                borderRadius: 8,
                border: "1px solid oklch(0.34 0.034 250)",
                background: "oklch(0.21 0.034 250)",
                boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
              }}
            >
              {suggestions.map((v) => (
                <div
                  key={v}
                  // mousedown, not click: the blur that a click fires first
                  // would close this list before the click ever landed.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(v);
                    setDraft("");
                  }}
                  style={{
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    fontSize: 10,
                    padding: "5px 8px",
                    borderRadius: 5,
                    cursor: "pointer",
                    color: tonePerValue ? tagTone(v).fg : tone.fg,
                    whiteSpace: "nowrap",
                  }}
                >
                  {v}
                </div>
              ))}
            </div>
          )}
        </span>
      )}
    </div>
  );
}

// Valide / Invalid. Clicking the side already chosen clears it, so an example
// can go back to undecided without a third button. Once a side is picked the
// other one is hidden unless the header is hovered: the card should read as its
// verdict, not as a pair of buttons.

/**
 * A pull-down for a fixed set of answers.
 *
 * Ten chips laid end to end — five kinds of trade, two zones, three verdicts —
 * pushed the images down and read as a form. Closed, this shows only what was
 * answered; open, it is the list of what could be. Multi-select for the kinds a
 * trade can be several of at once, single for the ones it can only be one of.
 */
function ChipDropdown({
  placeholder,
  options,
  selected,
  multiple,
  visible,
  onToggle,
  onAdd,
  onRemoveOption,
  canRemove,
}: {
  placeholder: string;
  options: string[];
  selected: string[];
  multiple?: boolean;
  visible: boolean;
  onToggle: (value: string) => void;
  /** Present when the vocabulary can be added to. */
  onAdd?: (value: string) => void;
  /** Present when options can be removed from the vocabulary entirely. */
  onRemoveOption?: (value: string) => boolean;
  /** Which of them can: a ✕ that does nothing is worse than no ✕ at all. */
  canRemove?: (value: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // Nothing answered and the pointer elsewhere: the card stays clean.
  if (!selected.length && !visible) return null;

  const tone = selected.length ? tagTone(selected[0]) : null;
  const label = selected.length ? selected.join(" · ") : placeholder;

  return (
    <div style={{ position: "relative", flex: "none" }} onMouseLeave={() => setOpen(false)}>
      <span
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          maxWidth: 320,
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 10,
          padding: "3px 9px",
          borderRadius: 999,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          border: `1px ${selected.length ? "solid" : "dashed"} ${tone ? tone.line : "oklch(0.34 0.02 250)"}`,
          background: tone ? tone.bg : "transparent",
          color: tone ? tone.fg : "oklch(0.6 0.02 250)",
        }}
      >
        {label}
        <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
      </span>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "130%",
            left: 0,
            zIndex: 40,
            minWidth: 210,
            maxHeight: 280,
            overflowY: "auto",
            padding: 4,
            borderRadius: 8,
            border: "1px solid oklch(0.34 0.034 250)",
            background: "oklch(0.21 0.034 250)",
            boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
          }}
        >
          {options.map((option) => {
            const on = selected.includes(option);
            const optionTone = tagTone(option);
            const removable = onRemoveOption !== undefined && (!canRemove || canRemove(option));
            return (
              <div
                key={option}
                onClick={() => {
                  onToggle(option);
                  if (!multiple) setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontSize: 10.5,
                  color: on ? optionTone.fg : "oklch(0.72 0.02 250)",
                  background: on ? optionTone.bg : "transparent",
                }}
              >
                <span style={{ width: 10, flex: "none", color: optionTone.fg }}>{on ? "✓" : ""}</span>
                <span style={{ flex: 1 }}>{option}</span>
                {removable && (
                  <span
                    title="Retirer de la liste, sur tous les exemples"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRemoveOption(option)) setOpen(false);
                    }}
                    style={{ fontSize: 11, opacity: 0.55 }}
                  >
                    ✕
                  </span>
                )}
              </div>
            );
          })}

          {onAdd && (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = draft.trim();
                  setDraft("");
                  if (v) onAdd(v);
                }
                if (e.key === "Escape") setDraft("");
              }}
              placeholder="+ nouveau"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 4,
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: 10,
                padding: "5px 8px",
                borderRadius: 5,
                border: "1px dashed oklch(0.34 0.02 250)",
                background: "transparent",
                color: "oklch(0.8 0.02 250)",
                outline: "none",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ExampleCard({ example, images, blocks, onChanged }: { example: ExampleRecord; images: ImageRecord[]; blocks: BlockRecord[]; onChanged: () => void }) {
  const [title, setTitle] = useState(example.title);
  const [exampleBlocks, setExampleBlocks] = useState<BlockRecord[]>(blocks);
  const [headerHover, setHeaderHover] = useState(false);
  const [showTradePicker, setShowTradePicker] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [imagesPerRow, setImagesPerRow] = useState<1 | 2>(example.imagesPerRow === 1 ? 1 : 2);

  // The three hand-written annotations. Each write is fire-and-forget, like the
  // title above it: the value on screen is already the new one, and the action
  // revalidates /notes for the next load.
  const [confirmations, setConfirmations] = useState<string[]>(() => parseArr(example.confirmations));
  const [validity, setValidity] = useState<Validity>(() => normalizeValidity(example.validity));
  const [invalidReasons, setInvalidReasons] = useState<string[]>(() => parseArr(example.invalidReasons));
  const [zone, setZone] = useState<Zone>(() => normalizeZone(example.zone));
  const [tradeTypes, setTradeTypes] = useState<string[]>(() => parseArr(example.tradeTypes));
  const vocabulary = useContext(TagVocabularyContext);
  // What the journal knows, plus anything ticked here it has not seen yet.
  const known = vocabulary.values("tradeType");
  const typeOptions = [...known, ...tradeTypes.filter((t) => !known.includes(t))];

  // Starts from what the server sent, so a folded example is already folded in
  // the very first paint. The write is not awaited and nothing is revalidated:
  // the fold is applied here, and the next load reads the stored value.
  const [collapsed, setCollapsed] = useState(example.collapsed);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      setExampleCollapsed(example.id, !c);
      return !c;
    });
  };
  const fileRef = useRef<HTMLInputElement>(null);

  // Adding or removing an image used to go through router.refresh(), which
  // re-fetches the whole notes page — 1.25MB and five queries to show one new
  // thumbnail, with nothing on screen until it came back. The list is held here
  // instead so those two actions can be applied on the spot.
  const [localImages, setLocalImages] = useState<ImageRecord[]>(images);
  // Re-sync when the server actually sends a different set, but not on every
  // re-render, which would wipe an optimistic entry the props do not know about.
  const imagesKey = images.map((i) => i.id).join(",");
  const syncedKey = useRef(imagesKey);
  useEffect(() => {
    if (syncedKey.current === imagesKey) return;
    syncedKey.current = imagesKey;
    setLocalImages(images);
  }, [imagesKey, images]);

  const toggleImagesPerRow = () => {
    const next: 1 | 2 = imagesPerRow === 2 ? 1 : 2;
    setImagesPerRow(next);
    updateExample(example.id, { imagesPerRow: next });
  };

  // Sends one already-previewed file and swaps its preview for the stored
  // record, which carries the id needed to remove it or caption it later.
  // Returns why it failed, or null when it went through.
  const uploadPreviewed = async (file: File, pendingId: string, previewUrl: string): Promise<string | null> => {
    const drop = (reason: string) => {
      setLocalImages((list) => list.filter((i) => i.id !== pendingId));
      URL.revokeObjectURL(previewUrl);
      return reason;
    };

    let upload = file;
    try {
      upload = await compressImage(file, MAX_IMAGE_BYTES);
    } catch {
      // Undecodable image: send it as-is and let the size check below speak.
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return drop("compression insuffisante, réduis la résolution");
    }

    const fd = new FormData();
    fd.append("exampleId", example.id);
    fd.append("image", upload);
    let res: Response;
    try {
      res = await fetch("/api/uploads", { method: "POST", body: fd });
    } catch {
      return drop("connexion interrompue");
    }
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }));
      return drop(error ?? "refusée par le serveur");
    }

    const { image } = (await res.json()) as { image: ImageRecord };
    setLocalImages((list) => list.map((i) => (i.id === pendingId ? image : i)));
    URL.revokeObjectURL(previewUrl);
    return null;
  };

  // Every file gets its preview up front, so dropping six screenshots fills the
  // grid at once instead of one tile every second or so. The uploads themselves
  // run one at a time: several in parallel would put more than the ~1MB this
  // network path can carry on the wire together, which is what makes a request
  // hang and never answer (see src/lib/compressImage.ts).
  const addImageFiles = async (selected: File[]) => {
    const files = selected.filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setFileError(null);

    const failures: { name: string; reason: string }[] = [];
    const queue: { file: File; pendingId: string; previewUrl: string }[] = [];
    for (const file of files) {
      if (file.size > MAX_SOURCE_BYTES) {
        failures.push({ name: file.name, reason: `trop volumineuse (${(file.size / (1024 * 1024)).toFixed(1)} Mo)` });
        continue;
      }
      queue.push({ file, pendingId: `${PENDING_PREFIX}${crypto.randomUUID()}`, previewUrl: URL.createObjectURL(file) });
    }

    setLocalImages((list) => [
      ...list,
      ...queue.map((q, i) => ({
        id: q.pendingId,
        exampleId: example.id,
        url: q.previewUrl,
        caption: null,
        tradeId: null,
        order: list.length + i,
        // Not measured yet — the server answers with the real ones a moment
        // later. A tile being sent is the one place a shift costs nothing: it
        // is on screen because they just dropped it there.
        width: null,
        height: null,
      })),
    ]);

    for (const q of queue) {
      const reason = await uploadPreviewed(q.file, q.pendingId, q.previewUrl);
      if (reason) failures.push({ name: q.file.name, reason });
    }

    if (failures.length) {
      // One line per reason rather than per file: dropping eight screenshots
      // from one folder tends to fail the same way eight times.
      const byReason = new Map<string, string[]>();
      for (const f of failures) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.name]);
      setFileError(
        [...byReason].map(([reason, names]) => `${names.join(", ")} — ${reason}.`).join(" ")
      );
    }
  };

  return (
    <div style={{ border: "1px solid oklch(0.26 0.034 250)", borderRadius: 12, background: "oklch(0.185 0.034 250)" }}>
      <div
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
        style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div className="example-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            onClick={toggleCollapsed}
            style={{ width: 14, height: 22, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ChevronIcon color="oklch(0.5 0.034 250)" down={!collapsed} />
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
              style={{ flex: 1, minWidth: 90, fontSize: 15, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: "oklch(0.94 0.0068 250)" }}
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
                border: "1px dashed oklch(0.34 0.034 250)",
                color: "oklch(0.6 0.034 250)",
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
              border: "1px solid oklch(0.34 0.034 250)",
              color: "oklch(0.6 0.034 250)",
              cursor: "pointer",
              opacity: headerHover ? 1 : 0,
              transition: "opacity 0.12s ease",
              whiteSpace: "nowrap",
            }}
          >
            {imagesPerRow} img/ligne
          </span>
          <MoveExampleMenu
            exampleId={example.id}
            currentNoteId={example.noteId}
            currentCategoryId={example.categoryId}
            visible={headerHover}
            onMoved={onChanged}
          />
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
            onDuplicate={async () => {
              await duplicateExample(example.id);
              onChanged();
            }}
            onDelete={async () => {
              await deleteExample(example.id);
              onChanged();
            }}
          />
        </div>
        {/* Confirmations, verdict and reasons read as one line of annotation
            rather than three labelled rows: they describe the same trade, and
            the chips say what they are without a word in front of them. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ChipList
            values={confirmations}
            kind="confirmation"
            tone={VALID_TONE}
            tonePerValue
            placeholder="+ confirmation"
            visible={headerHover}
            onChange={(next) => {
              setConfirmations(next);
              updateExample(example.id, { confirmations: next });
            }}
          />
          <ChipDropdown
            placeholder="Type"
            options={typeOptions}
            selected={tradeTypes}
            multiple
            visible={headerHover}
            onToggle={(value) => {
              const next = tradeTypes.includes(value)
                ? tradeTypes.filter((v) => v !== value)
                : [...tradeTypes, value];
              setTradeTypes(next);
              updateExample(example.id, { tradeTypes: next });
            }}
            onAdd={(value) => {
              if (tradeTypes.includes(value)) return;
              vocabulary.remember("tradeType", value);
              const next = [...tradeTypes, value];
              setTradeTypes(next);
              updateExample(example.id, { tradeTypes: next });
            }}
            // One of the five in the code would come straight back on the next
            // load, so it is not offered for removal.
            canRemove={(value) => !(TRADE_TYPES as readonly string[]).includes(value)}
            onRemoveOption={(value) => {
              if (!window.confirm(`Retirer « ${value} » de tous les exemples ?`)) return false;
              setTradeTypes((prev) => prev.filter((v) => v !== value));
              // Other cards carry the same type: the page has to be refetched
              // for it to leave them and the list of options too.
              deleteTradeType(value).then(onChanged);
              return true;
            }}
          />
          <ChipDropdown
            placeholder="Zone"
            options={ZONES.map(([, text]) => text)}
            selected={zone ? [ZONES.find(([key]) => key === zone)![1]] : []}
            visible={headerHover}
            onToggle={(value) => {
              const key = ZONES.find(([, text]) => text === value)![0];
              const next = zone === key ? null : key;
              setZone(next);
              updateExample(example.id, { zone: next });
            }}
          />
          <ChipDropdown
            placeholder="Verdict"
            options={VERDICTS.map(([, text]) => text)}
            selected={validity ? [VERDICTS.find(([key]) => key === validity)![1]] : []}
            visible={headerHover}
            onToggle={(value) => {
              const key = VERDICTS.find(([, text]) => text === value)![0];
              const next = validity === key ? null : key;
              setValidity(next);
              updateExample(example.id, { validity: next });
            }}
          />
          {(validity === "invalid" || validity === "risk") && (
            <ChipList
              values={invalidReasons}
              kind="invalidReason"
              tone={validity === "risk" ? RISK_TONE : INVALID_TONE}
              tonePerValue
              placeholder="+ raison"
              visible={headerHover}
              onChange={(next) => {
                setInvalidReasons(next);
                updateExample(example.id, { invalidReasons: next });
              }}
            />
          )}
        </div>
      </div>
      {!collapsed && (
      <div style={{ borderTop: "1px solid oklch(0.24 0.034 250)" }}>
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
        <div
          // The drop target covers the images and the buttons under them, not
          // the whole card: the text blocks above are their own editing surface
          // and a file dropped there means nothing.
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            if (!dropping) setDropping(true);
          }}
          onDragLeave={(e) => {
            // Fires when crossing into a child too, so only a pointer that has
            // really left the zone counts.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={async (e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(false);
            await addImageFiles(Array.from(e.dataTransfer.files));
          }}
          style={{
            outline: `1px dashed ${dropping ? accentColor : "transparent"}`,
            outlineOffset: -3,
            borderRadius: 10,
            transition: "outline-color 0.12s ease",
          }}
        >
        {/* alignItems: start — grid cells stretch to the tallest in the row by
            default, which would hang empty space under the shorter tiles now
            that tiles no longer share one height. */}
        {localImages.length > 0 && (
          <div className="example-images" style={{ display: "grid", gridTemplateColumns: localImages.length === 1 ? "1fr" : `repeat(${imagesPerRow}, 1fr)`, gap: 10, padding: 10, alignItems: "start" }}>
            {localImages.map((img) => (
              <ExampleImage
                key={img.id}
                img={img}
                imagesPerRow={localImages.length === 1 ? 1 : imagesPerRow}
                pending={img.id.startsWith(PENDING_PREFIX)}
                onOpen={() => setLightboxUrl(img.url)}
                onRemove={async () => {
                  const removed = localImages;
                  setLocalImages((list) => list.filter((i) => i.id !== img.id));
                  try {
                    await removeExampleImage(img.id);
                  } catch {
                    setLocalImages(removed);
                    setFileError("Suppression impossible. Réessaie.");
                  }
                }}
              />
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (fileRef.current) fileRef.current.value = "";
            await addImageFiles(files);
          }}
        />
        <div style={{ margin: "0 12px 12px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ flex: 1, height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: `1px dashed ${dropping ? accentColor : "oklch(0.34 0.034 250)"}`, borderRadius: 8, color: dropping ? accentColor : "oklch(0.6 0.034 250)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, transition: "border-color 0.12s ease, color 0.12s ease" }}
            >
              {dropping ? "dépose tes images" : (<><span style={{ fontSize: 16 }}>+</span> images</>)}
            </div>
            <div style={{ position: "relative", flex: 1 }}>
              <div
                onClick={() => setShowTradePicker((s) => !s)}
                style={{ height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px dashed oklch(0.34 0.034 250)", borderRadius: 8, color: "oklch(0.6 0.034 250)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11 }}
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
          </div>
          {fileError && (
            <div style={{ marginTop: 5, fontSize: 11.5, color: lossColor }}>{fileError}</div>
          )}
        </div>
        </div>
      </div>
      )}
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
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
        placeholder="Chercher un symbole..."
        style={{ width: "100%", fontSize: 12.5, padding: "7px 9px", borderRadius: 7, border: "1px solid oklch(0.32 0.034 250)", background: "oklch(0.16 0.034 250)", color: "oklch(0.9 0.0085 250)", outline: "none", marginBottom: 6, boxSizing: "border-box" }}
      />
      {loading && <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", padding: "6px 4px" }}>Chargement...</div>}
      {!loading && results.length === 0 && <div style={{ fontSize: 12, color: "oklch(0.55 0.034 250)", padding: "6px 4px" }}>Aucun trade trouvé.</div>}
      {!loading &&
        results.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12.5 }}
          >
            <span style={{ color: "oklch(0.9 0.0085 250)", fontWeight: 600 }}>
              {t.symbol} <span style={{ fontWeight: 400, color: "oklch(0.6 0.034 250)" }}>· {t.setup}</span>
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
      <ChartIcon color="oklch(0.92 0.0068 250)" />
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
          color: "oklch(0.92 0.0068 250)",
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
      <div style={{ position: "absolute", left: "var(--handle-offset)", top: 2 }}>
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
  color: "oklch(0.82 0.017 250)",
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
