"use client";

import { useEffect, useState, useTransition } from "react";
import { accentColor, glassCard } from "@/lib/theme";
import { PageTitle } from "@/components/NeonText";
import { createChecklistItem, deleteChecklistItem, renameChecklistItem, setChecklistItemOptions } from "@/lib/actions/checklist";

type ChecklistItem = { id: string; group: string; label: string; options?: string | null };

/** The answers an item offers, if any. Stored as JSON, empty when malformed. */
function answerOptions(item: ChecklistItem): string[] {
  if (!item.options) return [];
  try {
    const parsed = JSON.parse(item.options);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// "en-CA" formats as YYYY-MM-DD in the *local* timezone. toISOString() would
// give UTC, which lags Paris by 1-2h, so between midnight and 02:00 local it
// still reads as yesterday and would file those ticks under the wrong day.
function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function marketStorageKey(market: string) {
  return `checklistChecked:${market}:${todayKey()}`;
}

// Answers live beside the ticks: same market, same day, same device. What the
// market looked like on Tuesday is not an answer to Wednesday's checklist.
function answerStorageKey(market: string) {
  return `checklistAnswers:${market}:${todayKey()}`;
}


export default function ChecklistClient({
  items,
  market,
  title = "Checklist & News",
  subtitle = "Routine avant-marché",
}: {
  items: ChecklistItem[];
  market: string;
  title?: string;
  subtitle?: string;
}) {
  const [, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupItem, setNewGroupItem] = useState("");
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let saved: Record<string, boolean> = {};
    try {
      const raw = window.localStorage.getItem(marketStorageKey(market));
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = {};
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate checked state from localStorage for the selected market
    setCheckedMap(saved);

    let answers: Record<string, string> = {};
    try {
      const raw = window.localStorage.getItem(answerStorageKey(market));
      if (raw) answers = JSON.parse(raw);
    } catch {
      answers = {};
    }
    setAnswerMap(answers);
  }, [market]);

  const groups = Array.from(new Set(items.map((i) => i.group))).map((group) => ({
    title: group,
    items: items.filter((i) => i.group === group),
  }));

  const doneCount = items.filter((i) => checkedMap[i.id]).length;
  const totalCount = items.length;
  const percent = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  function toggle(item: ChecklistItem) {
    setCheckedMap((prev) => {
      const next = { ...prev, [item.id]: !prev[item.id] };
      try {
        window.localStorage.setItem(marketStorageKey(market), JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  /**
   * Records an answer, and ticks the item off with it.
   *
   * Answering is what doing this item means, so the tick follows; picking the
   * same answer again clears both, which is the only way back from a misclick.
   */
  function answer(item: ChecklistItem, value: string) {
    const clearing = answerMap[item.id] === value;
    setAnswerMap((prev) => {
      const next = { ...prev };
      if (clearing) delete next[item.id];
      else next[item.id] = value;
      try {
        window.localStorage.setItem(answerStorageKey(market), JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
    setCheckedMap((prev) => {
      const next = { ...prev, [item.id]: !clearing };
      try {
        window.localStorage.setItem(marketStorageKey(market), JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  function saveOptions(item: ChecklistItem, raw: string) {
    const options = raw.split("/").map((o) => o.trim()).filter(Boolean);
    if (JSON.stringify(options) === JSON.stringify(answerOptions(item))) return;
    startTransition(async () => {
      await setChecklistItemOptions(item.id, options);
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

  const todayLabel = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageTitle>{title}</PageTitle>
        <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
          {subtitle} — {todayLabel} — {market}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={glassCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Progression
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
                  border: `1px solid ${editMode ? accentColor : "oklch(0.4 0.034 250)"}`,
                  background: editMode ? accentColor : "transparent",
                  color: editMode ? "oklch(0.12 0.017 250)" : "oklch(0.75 0.034 250)",
                  cursor: "pointer",
                }}
              >
                {editMode ? "Terminé" : "Modifier la liste"}
              </button>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "oklch(0.26 0.034 250)", overflow: "hidden", marginBottom: 26 }}>
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
              <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.75 0.034 250)", marginBottom: 10 }}>{g.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {g.items.map((item) => {
                  const options = answerOptions(item);
                  return (
                  <div key={item.id}>
                  <div
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
                        border: `1.5px solid ${checkedMap[item.id] ? accentColor : "oklch(0.42 0.034 250)"}`,
                        background: checkedMap[item.id] ? accentColor : "transparent",
                      }}
                    >
                      {checkedMap[item.id] && (
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-6" fill="none" stroke="oklch(0.12 0.017 250)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
                          color: "oklch(0.88 0.017 250)",
                          background: "oklch(0.2 0.034 250)",
                          border: "1px solid oklch(0.35 0.034 250)",
                          borderRadius: 6,
                          padding: "4px 8px",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          fontSize: 14,
                          color: checkedMap[item.id] ? "oklch(0.5 0.0255 250)" : "oklch(0.88 0.017 250)",
                          textDecoration: checkedMap[item.id] ? "line-through" : "none",
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
                          border: "1px solid oklch(0.4 0.034 250)",
                          background: "transparent",
                          color: "oklch(0.65 0.034 250)",
                          cursor: "pointer",
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* The answers sit under the line rather than beside it: the
                      questions that have any are long, and a chip pushed to the
                      end of one would be off the edge on a phone. */}
                  {!editMode && options.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 8px 10px 40px" }}>
                      {options.map((option) => {
                        const on = answerMap[item.id] === option;
                        return (
                          <span
                            key={option}
                            onClick={(e) => {
                              e.stopPropagation();
                              answer(item, option);
                            }}
                            style={{
                              fontFamily: "var(--font-jetbrains-mono), monospace",
                              fontSize: 11,
                              padding: "4px 12px",
                              borderRadius: 999,
                              cursor: "pointer",
                              border: `1px ${on ? "solid" : "dashed"} ${on ? accentColor : "oklch(0.38 0.034 250)"}`,
                              background: on ? "oklch(0.84 0.17 196 / 0.16)" : "transparent",
                              color: on ? accentColor : "oklch(0.62 0.034 250)",
                            }}
                          >
                            {option}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {editMode && (
                    <div style={{ padding: "0 8px 10px 40px" }}>
                      <input
                        defaultValue={options.join(" / ")}
                        placeholder="Réponses possibles, séparées par « / »"
                        onBlur={(e) => saveOptions(item, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          fontSize: 12,
                          color: "oklch(0.8 0.017 250)",
                          background: "transparent",
                          border: "1px dashed oklch(0.34 0.034 250)",
                          borderRadius: 6,
                          padding: "4px 8px",
                        }}
                      />
                    </div>
                  )}
                  </div>
                  );
                })}
                {editMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px" }}>
                    <div style={{ width: 20, flexShrink: 0 }} />
                    <input
                      placeholder="Ajouter un élément…"
                      value={newItemDrafts[g.title] ?? ""}
                      onChange={(e) => setNewItemDrafts((d) => ({ ...d, [g.title]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addItem(g.title);
                      }}
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: "oklch(0.88 0.017 250)",
                        background: "transparent",
                        border: "1px dashed oklch(0.4 0.034 250)",
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
                      Ajouter
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {editMode && (
            <div style={{ paddingTop: 6, borderTop: "1px solid oklch(0.3 0.034 250 / 0.6)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.75 0.034 250)", marginBottom: 10 }}>Nouveau groupe</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="Nom du groupe…"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  style={{
                    flex: "1 1 140px",
                    fontSize: 14,
                    color: "oklch(0.88 0.017 250)",
                    background: "transparent",
                    border: "1px dashed oklch(0.4 0.034 250)",
                    borderRadius: 6,
                    padding: "6px 8px",
                  }}
                />
                <input
                  placeholder="Premier élément…"
                  value={newGroupItem}
                  onChange={(e) => setNewGroupItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addGroup();
                  }}
                  style={{
                    flex: "1 1 140px",
                    fontSize: 14,
                    color: "oklch(0.88 0.017 250)",
                    background: "transparent",
                    border: "1px dashed oklch(0.4 0.034 250)",
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
                  Ajouter le groupe
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
