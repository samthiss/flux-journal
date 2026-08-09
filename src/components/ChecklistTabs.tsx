"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { accentColor, glassCard } from "@/lib/theme";
import { DEFAULT_MARKETS, loadMarkets, saveMarkets } from "@/lib/markets";
import VolumeChecklist from "@/components/VolumeChecklist";
import ColorCode from "@/components/ColorCode";
import ChecklistClient from "@/components/ChecklistClient";

type ChecklistItem = { id: string; group: string; label: string };

const TABS = [
  { key: "volume", label: "Lignes de volumes" },
  { key: "premarket", label: "Pre-Market Analyse" },
  { key: "postmarket", label: "Post-Market Analyse" },
] as const;

const POSTMARKET_GROUP = "Bilan";

type TabKey = (typeof TABS)[number]["key"];

const tabStyle = (active: boolean): CSSProperties => ({
  padding: "10px 18px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  background: active ? accentColor : "transparent",
  color: active ? "oklch(0.12 0.01 290)" : "oklch(0.7 0.02 290)",
  border: `1px solid ${active ? accentColor : "oklch(0.4 0.02 290)"}`,
});

const marketPillStyle = (active: boolean): CSSProperties => ({
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  background: active ? accentColor : "transparent",
  color: active ? "oklch(0.12 0.01 290)" : "oklch(0.7 0.02 290)",
  border: `1px solid ${active ? accentColor : "oklch(0.4 0.02 290)"}`,
});

export default function ChecklistTabs({ items }: { items: ChecklistItem[] }) {
  const [tab, setTab] = useState<TabKey>("volume");
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS);
  const [market, setMarket] = useState(DEFAULT_MARKETS[0]);
  const [editMarkets, setEditMarkets] = useState(false);
  const [newMarketDraft, setNewMarketDraft] = useState("");

  useEffect(() => {
    const stored = loadMarkets();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount to avoid SSR mismatch
    setMarkets(stored);
    setMarket(stored[0]);
  }, []);

  function addMarket() {
    const value = newMarketDraft.trim().toUpperCase();
    if (!value || markets.includes(value)) return;
    const next = [...markets, value];
    setMarkets(next);
    saveMarkets(next);
    setNewMarketDraft("");
  }

  function removeMarket(m: string) {
    if (markets.length <= 1) return;
    const next = markets.filter((x) => x !== m);
    setMarkets(next);
    saveMarkets(next);
    if (market === m) setMarket(next[0]);
  }

  return (
    <div>
      <div style={{ ...glassCard, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editMarkets ? 12 : 0 }}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.02 290)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Marché
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {markets.map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                style={{ ...marketPillStyle(m === market), display: "flex", alignItems: "center", gap: 6 }}
              >
                {m}
                {editMarkets && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMarket(m);
                    }}
                    style={{ fontSize: 12, lineHeight: 1 }}
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => setEditMarkets((v) => !v)}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 6,
                border: `1px solid ${editMarkets ? accentColor : "oklch(0.4 0.02 290)"}`,
                background: editMarkets ? accentColor : "transparent",
                color: editMarkets ? "oklch(0.12 0.01 290)" : "oklch(0.75 0.02 290)",
                cursor: "pointer",
              }}
            >
              {editMarkets ? "Terminé" : "Modifier les marchés"}
            </button>
          </div>
        </div>

        {editMarkets && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Ajouter un marché… (ex. SI)"
              value={newMarketDraft}
              onChange={(e) => setNewMarketDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addMarket();
              }}
              style={{
                flex: "1 1 160px",
                fontSize: 14,
                color: "oklch(0.88 0.01 290)",
                background: "transparent",
                border: "1px dashed oklch(0.4 0.02 290)",
                borderRadius: 6,
                padding: "6px 8px",
              }}
            />
            <button
              onClick={addMarket}
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
              Ajouter
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "volume" && (
        <div>
          <VolumeChecklist market={market} />
          <ColorCode />
        </div>
      )}
      {tab === "premarket" && (
        <ChecklistClient items={items.filter((i) => i.group !== POSTMARKET_GROUP)} market={market} />
      )}
      {tab === "postmarket" && (
        <ChecklistClient
          items={items.filter((i) => i.group === POSTMARKET_GROUP)}
          market={market}
          title="Post-Market Analyse"
          subtitle="Bilan post-marché"
          showCalendar={false}
        />
      )}
    </div>
  );
}
