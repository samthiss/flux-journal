"use client";

import { useOptimistic, useTransition } from "react";
import { accentColor, glassCard } from "@/lib/theme";
import { toggleChecklistItem } from "@/lib/actions/checklist";

type ChecklistItem = { id: string; group: string; label: string; checked: boolean };

const NEWS_SEED = [
  { time: "08:30", title: "US Initial Jobless Claims", impact: "high" },
  { time: "09:45", title: "S&P Global Services PMI", impact: "medium" },
  { time: "10:00", title: "Existing Home Sales", impact: "low" },
  { time: "10:30", title: "EIA Crude Oil Inventories", impact: "medium" },
  { time: "14:00", title: "Fed Speaker: Williams", impact: "high" },
];

const IMPACT_COLORS: Record<string, string> = {
  high: accentColor,
  medium: "oklch(0.6 0.02 290)",
  low: "oklch(0.4 0.01 290)",
};

export default function ChecklistClient({ items }: { items: ChecklistItem[] }) {
  const [, startTransition] = useTransition();
  const [optimisticItems, setOptimisticItems] = useOptimistic(items, (state, id: string) =>
    state.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
  );

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
            <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 14, color: accentColor }}>
              {doneCount} / {totalCount}
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
                    onClick={() => toggle(item)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 8, cursor: "pointer" }}
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
                    <div
                      style={{
                        fontSize: 14,
                        color: item.checked ? "oklch(0.5 0.015 290)" : "oklch(0.88 0.01 290)",
                        textDecoration: item.checked ? "line-through" : "none",
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...glassCard, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid oklch(0.3 0.02 290 / 0.6)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Economic Calendar</div>
            <div style={{ fontSize: 11, color: "oklch(0.55 0.02 290)", marginLeft: "auto", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
              investing.com
            </div>
          </div>
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {NEWS_SEED.map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid oklch(0.24 0.02 290 / 0.5)" }}>
                <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, color: "oklch(0.55 0.02 290)", width: 44, flexShrink: 0 }}>
                  {n.time}
                </div>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: IMPACT_COLORS[n.impact], flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: "oklch(0.85 0.01 290)", flex: 1 }}>{n.title}</div>
              </div>
            ))}
          </div>
          <div
            style={{
              margin: "0 18px 18px 18px",
              padding: "22px 14px",
              borderRadius: 10,
              border: "1px dashed oklch(0.4 0.03 290 / 0.6)",
              background:
                "repeating-linear-gradient(135deg, oklch(0.19 0.02 290) 0px, oklch(0.19 0.02 290) 8px, oklch(0.16 0.018 290) 8px, oklch(0.16 0.018 290) 16px)",
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 11, color: "oklch(0.6 0.02 290)" }}>
              [ embed investing.com widget here ]
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
