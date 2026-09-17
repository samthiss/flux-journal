"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { accentColor, glassCard } from "@/lib/theme";
import { PageTitle } from "@/components/NeonText";
import { DEFAULT_MARKETS, loadMarkets, saveMarkets } from "@/lib/markets";
import VolumeChecklist from "@/components/VolumeChecklist";
import ColorCode from "@/components/ColorCode";
import ChecklistClient from "@/components/ChecklistClient";
import EconomicCalendar from "@/components/EconomicCalendar";
import type { EconomicEvent } from "@/lib/economicCalendar";

type ChecklistItem = { id: string; group: string; label: string; tab?: string | null };

const TABS = [
  { key: "calendar", label: "Calendrier économique" },
  { key: "volume", label: "Lignes de volumes" },
  { key: "premarket", label: "Pre-Market Analyse" },
  { key: "pretrade", label: "Trading Plan" },
  { key: "mindset", label: "Trading: Mindset & Discipline" },
  { key: "postmarket", label: "Post-Market Analyse" },
] as const;

const POSTMARKET_GROUP = "Bilan";

/**
 * What is decided in the minute before an entry.
 *
 * "Trading Plan" — the old "4b) Quelle stratégie puis-je trader aujourd'hui et
 * où ?" — and it alone. It already holds a line per strategy, each carrying its
 * trade ideas, so the empty "Trend run" and "Backtest reverse" sections beside
 * it said the same thing twice.
 *
 * Kept out of the pre-market tab on purpose: that one is read once, before the
 * session, while these are read again at every entry — and a list read at the
 * moment of a decision has to hold nothing but that decision.
 */
/**
 * Which tab a line belongs to, read from the line itself.
 *
 * The groups of each tab used to be named here, which made their headings
 * undeletable — nothing in the data made them exist, so nothing in the data
 * could remove them. A boot script wrote the tab onto the rows that were
 * listed here, and new sections carry it from the start.
 */
const PRETRADE = "pretrade";
const MINDSET = "mindset";


// Cards stretched to whatever the window was, which on a wide screen left a
// checklist line ending a third of the way across and a lot of empty card to
// its right. Capped at the width the notes page already reads at.
const CONTENT_WIDTH = 900;

type TabKey = (typeof TABS)[number]["key"];

const tabStyle = (active: boolean): CSSProperties => ({
  padding: "10px 18px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  background: active ? accentColor : "transparent",
  color: active ? "oklch(0.12 0.017 250)" : "oklch(0.7 0.034 250)",
  border: `1px solid ${active ? accentColor : "oklch(0.4 0.034 250)"}`,
});

const marketPillStyle = (active: boolean): CSSProperties => ({
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  background: active ? accentColor : "transparent",
  color: active ? "oklch(0.12 0.017 250)" : "oklch(0.7 0.034 250)",
  border: `1px solid ${active ? accentColor : "oklch(0.4 0.034 250)"}`,
});

export default function ChecklistTabs({
  items,
  events,
  calendarOk,
  calendarSource,
}: {
  items: ChecklistItem[];
  events: EconomicEvent[];
  calendarOk: boolean;
  calendarSource: string;
}) {
  const [tab, setTab] = useState<TabKey>("calendar");
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
    <div style={{ maxWidth: CONTENT_WIDTH }}>
      <div style={{ ...glassCard, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editMarkets ? 12 : 0 }}>
          <div style={{ fontSize: 13, color: "oklch(0.62 0.034 250)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                border: `1px solid ${editMarkets ? accentColor : "oklch(0.4 0.034 250)"}`,
                background: editMarkets ? accentColor : "transparent",
                color: editMarkets ? "oklch(0.12 0.017 250)" : "oklch(0.75 0.034 250)",
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
                color: "oklch(0.88 0.017 250)",
                background: "transparent",
                border: "1px dashed oklch(0.4 0.034 250)",
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

      <div className="checklist-tabs" style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <div>
          {/* Titled over the card rather than over the column, so the heading
              and the widget read as one centred block. */}
          <div style={{ marginBottom: 24, textAlign: "center" }}>
            <PageTitle>Calendrier économique</PageTitle>
            <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>
              Publications de la semaine — filtre les jours, les devises et l&apos;importance
            </div>
          </div>
          <EconomicCalendar events={events} ok={calendarOk} source={calendarSource} market={market} />
        </div>
      )}
      {tab === "volume" && (
        <div>
          <VolumeChecklist market={market} />
          <ColorCode />
        </div>
      )}
      {tab === "premarket" && (
        <ChecklistClient
          items={items.filter((i) => i.group !== POSTMARKET_GROUP && !i.tab)}
          market={market}
        />
      )}
      {tab === "pretrade" && (
        <ChecklistClient
          items={items.filter((i) => i.tab === PRETRADE)}
          market={market}
          title="Trading Plan"
          subtitle="À cocher avant d'entrer, selon la stratégie"
          tab={PRETRADE}
          builder
        />
      )}
      {tab === "mindset" && (
        <ChecklistClient
          items={items.filter((i) => i.tab === MINDSET)}
          market={market}
          title="Trading: Mindset & Discipline"
          subtitle="Ce qui dépend de toi, pas du marché"
          tab={MINDSET}
          builder
          positions
        />
      )}
      {tab === "postmarket" && (
        <ChecklistClient
          items={items.filter((i) => i.group === POSTMARKET_GROUP)}
          market={market}
          title="Post-Market Analyse"
          subtitle="Bilan post-marché"
          closes
        />
      )}
    </div>
  );
}
