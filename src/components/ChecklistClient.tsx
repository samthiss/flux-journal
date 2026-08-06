"use client";

import { useOptimistic, useState, useTransition } from "react";
import { accentColor, glassCard } from "@/lib/theme";
import {
  createChecklistItem,
  deleteChecklistItem,
  renameChecklistItem,
  toggleChecklistItem,
} from "@/lib/actions/checklist";

type ChecklistItem = { id: string; group: string; label: string; checked: boolean };

// countries: 5 United States, 72 Euro Zone, 22 France, 17 Germany, 4 United
// Kingdom, 12 Switzerland. timeZone=16 was confirmed empirically (Initial
// Jobless Claims — always released 8:30am US Eastern — showed as 14:30, the
// correct Paris/CEST time). All toggle controls (date picker, day/week/month
// tabs, filters) are dropped from "features" so the filters below stay fixed
// for every visitor.
const INVESTING_CALENDAR_SRC =
  "https://sslecal2.investing.com/?ecoDayBackground=%23131722&columns=exc_flag,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&countries=5,72,22,17,4,12&importance=3&calType=day&timeZone=16&lang=1";
// Investing.com always renders its own logo + app-store badges as a fixed
// header (~64px) above the table; there's no URL flag to remove it, so we
// crop it by rendering the iframe taller than its visible wrapper and
// shifting it up. Nudge INVESTING_HEADER_CROP if the crop line is off.
const INVESTING_HEADER_CROP = 64;
const INVESTING_VISIBLE_HEIGHT = 360;

export default function ChecklistClient({ items }: { items: ChecklistItem[] }) {
  const [, startTransition] = useTransition();
  const [optimisticItems, setOptimisticItems] = useOptimistic(items, (state, id: string) =>
    state.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
  );
  const [editMode, setEditMode] = useState(false);
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupItem, setNewGroupItem] = useState("");

  const groups = Array.from(new Set(optimisticItems.map((i) => i.group))).map((group) => ({
    title: group,
    items: optimisticItems.filter((i) => i.group === group),
  }));

  const doneCount = optimisticItems.filter((i) => i.checked).length;
  const totalCount = optimisticItems.length;
  const percent = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  function toggle(item: ChecklistItem) {
    startTransition(async () => {
      setOptimisticItems(item.id);
      await toggleChecklistItem(item.id, !item.checked);
    });
  }

  function rename(item: ChecklistItem, label: string) {
    if (label.trim() === item.label || !label.trim()) return;
    startTransition(async () => {
      await renameChecklistItem(item.id, label);
    });
  }

  function remove(item: ChecklistItem) {
    startTransition(async () => {
      await deleteChecklistItem(item.id);
    });
  }

  function addItem(group: string) {
    const label = (newItemDrafts[group] ?? "").trim();
    if (!label) return;
    setNewItemDrafts((d) => ({ ...d, [group]: "" }));
    startTransition(async () => {
      await createChecklistItem(group, label);
    });
  }

  function addGroup() {
    const group = newGroupName.trim();
    const label = newGroupItem.trim();
    if (!group || !label) return;
    setNewGroupName("");
    setNewGroupItem("");
    startTransition(async () => {
      await createChecklistItem(group, label);
    });
  }

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Checklist &amp; News</div>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.02 290)", marginTop: 4 }}>
          Pre-market routine — {todayLabel}
        </div>
      </div>

      <div className="checklist-grid">
        <div style={glassCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Progress
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 14, color: accentColor }}>
                {doneCount} / {totalCount}
              </div>
              <button
                onClick={() => setEditMode((v) => !v)}
                style={{
                  fontSize: 12,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${editMode ? accentColor : "oklch(0.4 0.02 290)"}`,
                  background: editMode ? accentColor : "transparent",
                  color: editMode ? "oklch(0.12 0.01 290)" : "oklch(0.75 0.02 290)",
                  cursor: "pointer",
                }}
              >
                {editMode ? "Done" : "Edit list"}
              </button>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "oklch(0.26 0.02 290)", overflow: "hidden", marginBottom: 26 }}>
            <div
              style={{
                height: "100%",
                width: `${percent}%`,
                background: accentColor,
                boxShadow: `0 0 10px ${accentColor}`,
                borderRadius: 4,
              }}
            />
          </div>

          {groups.map((g) => (
            <div key={g.title} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.75 0.02 290)", marginBottom: 10 }}>{g.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {g.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={editMode ? undefined : () => toggle(item)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 8, cursor: editMode ? "default" : "pointer" }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: `1.5px solid ${item.checked ? accentColor : "oklch(0.42 0.02 290)"}`,
                        background: item.checked ? accentColor : "transparent",
                      }}
                    >
                      {item.checked && (
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-6" fill="none" stroke="oklch(0.12 0.01 290)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    {editMode ? (
                      <input
                        defaultValue={item.label}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => rename(item, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: "oklch(0.88 0.01 290)",
                          background: "oklch(0.2 0.02 290)",
                          border: "1px solid oklch(0.35 0.02 290)",
                          borderRadius: 6,
                          padding: "4px 8px",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          fontSize: 14,
                          color: item.checked ? "oklch(0.5 0.015 290)" : "oklch(0.88 0.01 290)",
                          textDecoration: item.checked ? "line-through" : "none",
                        }}
                      >
                        {item.label}
                      </div>
                    )}
                    {editMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(item);
                        }}
                        aria-label="Delete item"
                        style={{
                          flexShrink: 0,
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: "1px solid oklch(0.4 0.02 290)",
                          background: "transparent",
                          color: "oklch(0.65 0.02 290)",
                          cursor: "pointer",
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {editMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px" }}>
                    <div style={{ width: 20, flexShrink: 0 }} />
                    <input
                      placeholder="Add item…"
                      value={newItemDrafts[g.title] ?? ""}
                      onChange={(e) => setNewItemDrafts((d) => ({ ...d, [g.title]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addItem(g.title);
                      }}
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: "oklch(0.88 0.01 290)",
                        background: "transparent",
                        border: "1px dashed oklch(0.4 0.02 290)",
                        borderRadius: 6,
                        padding: "4px 8px",
                      }}
                    />
                    <button
                      onClick={() => addItem(g.title)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: `1px solid ${accentColor}`,
                        background: "transparent",
                        color: accentColor,
                        cursor: "pointer",
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {editMode && (
            <div style={{ paddingTop: 6, borderTop: "1px solid oklch(0.3 0.02 290 / 0.6)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.75 0.02 290)", marginBottom: 10 }}>New group</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="Group name…"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  style={{
                    flex: "1 1 140px",
                    fontSize: 14,
                    color: "oklch(0.88 0.01 290)",
                    background: "transparent",
                    border: "1px dashed oklch(0.4 0.02 290)",
                    borderRadius: 6,
                    padding: "6px 8px",
                  }}
                />
                <input
                  placeholder="First item…"
                  value={newGroupItem}
                  onChange={(e) => setNewGroupItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addGroup();
                  }}
                  style={{
                    flex: "1 1 140px",
                    fontSize: 14,
                    color: "oklch(0.88 0.01 290)",
                    background: "transparent",
                    border: "1px dashed oklch(0.4 0.02 290)",
                    borderRadius: 6,
                    padding: "6px 8px",
                  }}
                />
                <button
                  onClick={addGroup}
                  style={{
                    fontSize: 12,
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px solid ${accentColor}`,
                    background: "transparent",
                    color: accentColor,
                    cursor: "pointer",
                  }}
                >
                  Add group
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...glassCard, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.02 290 / 0.6)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Economic Calendar</div>
            <div style={{ fontSize: 11, color: "oklch(0.55 0.02 290)", marginLeft: "auto", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
              investing.com
            </div>
          </div>
          <div style={{ height: INVESTING_VISIBLE_HEIGHT, overflow: "hidden auto" }}>
            <iframe
              src={INVESTING_CALENDAR_SRC}
              title="Economic Calendar"
              width="100%"
              height={900}
              frameBorder={0}
              allowTransparency
              style={{ display: "block", border: "none", marginTop: -INVESTING_HEADER_CROP }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
