"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { accentColor } from "@/lib/theme";
import { getNoteTree, createNote, reorderNote, deleteNote } from "@/lib/actions/notes";
import { signOut } from "@/app/login/actions";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/trades", label: "Trades", match: (p: string) => p.startsWith("/trades") },
  { href: "/checklist", label: "Checklist & News", match: (p: string) => p.startsWith("/checklist") },
  { href: "/notes", label: "Notes", match: (p: string) => p.startsWith("/notes") },
];

function DashboardIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="7" height="7" rx="1.5" fill={color} />
      <rect x="10" y="1" width="7" height="4" rx="1.5" fill={color} opacity="0.55" />
      <rect x="10" y="7" width="7" height="10" rx="1.5" fill={color} opacity="0.55" />
      <rect x="1" y="10" width="7" height="7" rx="1.5" fill={color} opacity="0.55" />
    </svg>
  );
}

function TradesIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="9" width="4" height="8" rx="1" fill={color} />
      <rect x="7" y="4" width="4" height="13" rx="1" fill={color} />
      <rect x="13" y="12" width="4" height="5" rx="1" fill={color} opacity="0.55" />
    </svg>
  );
}

function ChecklistIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="16" height="16" rx="3" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M5 9l3 3 5-6" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NotesIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path d="M4 1.5h7l3 3v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 7.5h6M6 10.5h6M6 13.5h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function SignOutIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.5 5.5 12.5 8l-3 2.5M12 8H6" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SidebarToggleIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke={color} strokeWidth="1.3" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function ChevronIcon({ color, down }: { color: string; down: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" style={{ transform: down ? "rotate(90deg)" : "none", transition: "transform 0.12s ease" }}>
      <path d="M3.5 1.5L7 5l-3.5 3.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 3.5h9M5.5 3.5V2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M3.5 3.5l.6 8.4a1 1 0 0 0 1 .93h3.8a1 1 0 0 0 1-.93l.6-8.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.7 6.2v4M8.3 6.2v4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function MoreMenuButton({ onDelete, className }: { onDelete: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={className}
      style={{ position: "relative", flex: "none", opacity: open ? 1 : undefined }}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Plus d'options"
        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, letterSpacing: "-1px", color: "oklch(0.55 0.02 290)", borderRadius: 5, cursor: "pointer" }}
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
            minWidth: 132,
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", fontSize: 12.5, color: "oklch(0.65 0.18 25)", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <TrashIcon /> Supprimer
          </span>
        </div>
      )}
    </div>
  );
}

const ICONS = [DashboardIcon, TradesIcon, ChecklistIcon, NotesIcon];

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

export default function Sidebar({ initialTree }: { initialTree: NoteRow[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const onNotes = pathname.startsWith("/notes");

  const [tree, setTree] = useState<NoteRow[]>(initialTree);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(252);
  const resizingRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage on mount
    if (localStorage.getItem("sidebar-hidden") === "1") setSidebarHidden(true);
    const savedWidth = Number(localStorage.getItem("sidebar-width"));
    if (savedWidth >= 200 && savedWidth <= 420) setSidebarWidth(savedWidth);
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebar-hidden", sidebarHidden ? "1" : "0");
  }, [sidebarHidden]);
  useEffect(() => {
    localStorage.setItem("sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      setSidebarWidth(Math.min(420, Math.max(200, startWidth + (ev.clientX - startX))));
    }
    function onUp() {
      resizingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function refreshTree() {
    const t = await getNoteTree();
    setTree(t);
  }

  // The tree arrived with the document. Fetching it again on the first render
  // would repeat, over the network, a query whose answer is already on screen —
  // which is what used to make the note list appear a moment after the page.
  // Coming back to /notes later still refetches: by then a mutation elsewhere
  // may have moved a note, and this layout was rendered once, several
  // navigations ago.
  // Empty means the layout had nothing to give — no session, or no notes yet.
  // Falling back to the fetch there costs one request and keeps the sidebar
  // working even if the server side of this ever stops providing the tree.
  const serverTreeIsFresh = useRef(initialTree.length > 0);

  useEffect(() => {
    if (!onNotes) return;
    if (serverTreeIsFresh.current) {
      serverTreeIsFresh.current = false;
      return;
    }
    let ignore = false;
    getNoteTree().then((t) => {
      if (!ignore) setTree(t);
    });
    return () => {
      ignore = true;
    };
  }, [onNotes]);

  useEffect(() => {
    if (!onNotes || tree.length === 0) return;
    const root = document.querySelector(".app-main");
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-note-section]"));
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.getAttribute("data-note-section"));
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [onNotes, tree]);

  const flat = useMemo(() => flattenDFS(buildTree(tree)), [tree]);
  const rows = flat.map(({ node, depth }) => ({
    id: node.id,
    title: node.title,
    depth,
    hasChildren: node.children.length > 0,
    isCollapsed: !!collapsed[node.id],
  }));
  const visibleRows = rows.filter((row) => {
    let cur = tree.find((n) => n.id === row.id);
    while (cur?.parentId) {
      if (collapsed[cur.parentId]) return false;
      cur = tree.find((n) => n.id === cur!.parentId);
    }
    return true;
  });

  function scrollTo(id: string) {
    document.getElementById("note-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // The sidebar lives in the root layout, which the login page inherits too.
  // Nothing in it is reachable before signing in, and a nav sitting next to a
  // password field only suggests otherwise.
  if (pathname === "/login") return null;

  return (
    <>
      {sidebarHidden && (
        <button className="sidebar-expand-btn" onClick={() => setSidebarHidden(false)} title="Afficher le menu" style={toggleBtnStyle}>
          <SidebarToggleIcon color="oklch(0.72 0.02 290)" />
        </button>
      )}
      <div className={sidebarHidden ? "sidebar sidebar-collapsed" : "sidebar"} style={sidebarHidden ? undefined : { width: sidebarWidth }}>
        <button onClick={() => setSidebarHidden(true)} title="Cacher le menu" style={{ ...toggleBtnStyle, position: "absolute", top: 14, right: 14 }}>
          <SidebarToggleIcon color="oklch(0.72 0.02 290)" />
        </button>
        <div
          onMouseDown={startResize}
          title="Redimensionner"
          style={{ position: "absolute", top: 0, right: -3, bottom: 0, width: 6, cursor: "col-resize", zIndex: 10 }}
        />
        <div className="sidebar-brand">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: accentColor,
              boxShadow: `0 0 12px ${accentColor}`,
              animation: "pulseDot 2.4s ease-in-out infinite",
            }}
          />
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.02em" }}>
            FLUX<span style={{ color: accentColor }}>JOURNAL</span>
          </div>
          <form action={signOut} style={{ marginLeft: "auto" }}>
            <button
              type="submit"
              title="Se déconnecter"
              style={{
                background: "none",
                border: "none",
                padding: 4,
                cursor: "pointer",
                color: "oklch(0.5 0.02 290)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <SignOutIcon color="currentColor" />
            </button>
          </form>
        </div>

        <div className="sidebar-nav">
        {NAV_ITEMS.map((item, i) => {
          const active = item.match(pathname);
          const Icon = ICONS[i];
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className="sidebar-nav-item"
                style={{
                  cursor: "pointer",
                  fontWeight: active ? 600 : 500,
                  color: active ? "oklch(0.97 0.004 290)" : "oklch(0.66 0.02 290)",
                  background: active ? "oklch(0.68 0.19 293 / 0.14)" : "transparent",
                }}
              >
                <Icon color={active ? accentColor : "oklch(0.55 0.02 290)"} />
                <span className="sidebar-nav-label">{item.label}</span>
              </Link>

              {item.href === "/notes" && onNotes && (
                <div className="sidebar-notes-tree" style={{ display: "flex", flexDirection: "column", gap: 1, margin: "12px 0 6px", paddingLeft: 18 }}>
                  {visibleRows.map((row) => (
                    <div
                      key={row.id}
                      className="sidebar-note-row"
                      draggable
                      onDragStart={() => {
                        dragIdRef.current = row.id;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverId !== row.id) setDragOverId(row.id);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const dragId = dragIdRef.current;
                        setDragOverId(null);
                        if (dragId && dragId !== row.id) {
                          await reorderNote(dragId, row.id);
                          await refreshTree();
                          router.refresh();
                        }
                      }}
                      onDragEnd={() => {
                        dragIdRef.current = null;
                        setDragOverId(null);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: `5px 6px 5px ${6 + row.depth * 13}px`,
                        borderRadius: 6,
                        cursor: "grab",
                        background: row.id === activeId ? "oklch(0.68 0.19 293 / 0.14)" : "transparent",
                        borderTop: dragOverId === row.id ? `2px solid ${accentColor}` : "2px solid transparent",
                      }}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (row.hasChildren) setCollapsed((s) => ({ ...s, [row.id]: !s[row.id] }));
                        }}
                        style={{ width: 10, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: row.hasChildren ? "pointer" : "default" }}
                      >
                        {row.hasChildren && <ChevronIcon color="oklch(0.5 0.02 290)" down={!row.isCollapsed} />}
                      </span>
                      <span
                        onClick={() => scrollTo(row.id)}
                        style={{
                          flex: 1,
                          fontSize: 12.5,
                          lineHeight: 1.3,
                          fontWeight: row.id === activeId ? 600 : 400,
                          color: row.id === activeId ? "oklch(0.95 0.005 290)" : "oklch(0.68 0.02 290)",
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.title}
                      </span>
                      {row.depth === 0 && (
                        <span
                          onClick={async (e) => {
                            e.stopPropagation();
                            await createNote(row.id);
                            await refreshTree();
                            router.refresh();
                          }}
                          title="Ajouter une note dans cette section"
                          className="sidebar-note-add"
                          style={{ flex: "none", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "oklch(0.48 0.02 290)", borderRadius: 6, cursor: "pointer" }}
                        >
                          +
                        </span>
                      )}
                      <MoreMenuButton
                        className="sidebar-note-add"
                        onDelete={async () => {
                          await deleteNote(row.id);
                          await refreshTree();
                          router.refresh();
                        }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={async () => {
                      await createNote(null);
                      await refreshTree();
                      router.refresh();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      marginTop: 6,
                      padding: "9px 12px",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "oklch(0.75 0.02 290)",
                      borderRadius: 9,
                      border: "1px solid oklch(0.34 0.02 290)",
                      background: "oklch(0.22 0.02 290)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Ajouter une note
                  </button>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </>
  );
}

const toggleBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "oklch(0.24 0.02 290)",
  border: "1px solid oklch(0.36 0.03 290 / 0.5)",
  color: "oklch(0.72 0.02 290)",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};
