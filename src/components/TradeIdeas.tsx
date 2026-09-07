"use client";

import { useState } from "react";
import { accentColor, winColor, lossColor } from "@/lib/theme";
import { tagTone, parseTagArray } from "@/lib/tags";
import { createTradeIdea, deleteTradeIdea } from "@/lib/actions/tradeIdeas";

export type TradeIdeaRecord = {
  id: string;
  itemId: string;
  side: string;
  tradeTypes: string | null;
  reason: string;
};

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

function SideChip({ side, on, onClick }: { side: "long" | "short"; on: boolean; onClick: () => void }) {
  const colour = side === "long" ? winColor : lossColor;
  return (
    <span
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 11,
        padding: "4px 14px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px ${on ? "solid" : "dashed"} ${on ? colour : "oklch(0.38 0.034 250)"}`,
        background: on ? `${colour.replace(")", " / 0.16)")}` : "transparent",
        color: on ? colour : "oklch(0.62 0.034 250)",
      }}
    >
      {side === "long" ? "Long" : "Short"}
    </span>
  );
}

function TypeChip({ value, on, onClick }: { value: string; on: boolean; onClick: () => void }) {
  const tone = tagTone(value);
  return (
    <span
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 10.5,
        padding: "4px 11px",
        borderRadius: 999,
        cursor: "pointer",
        whiteSpace: "nowrap",
        border: `1px ${on ? "solid" : "dashed"} ${on ? tone.line : "oklch(0.34 0.02 250)"}`,
        background: on ? tone.bg : "transparent",
        color: on ? tone.fg : "oklch(0.6 0.02 250)",
      }}
    >
      {value}
    </span>
  );
}

/**
 * The trades the reader means to take today, written under the strategy they
 * belong to.
 *
 * The checklist above says what to look at; this is where looking ends up — a
 * direction, what kind of setup it is, and the conditions that would make it
 * the right trade. Written while planning, so that the trade taken later can be
 * read against what was intended rather than against a memory of it.
 */
export default function TradeIdeas({
  itemId,
  market,
  day,
  ideas,
  vocabulary,
  onChanged,
}: {
  itemId: string;
  market: string;
  day: string;
  ideas: TradeIdeaRecord[];
  vocabulary: string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"long" | "short">("long");
  const [types, setTypes] = useState<string[]>([]);
  const [draftType, setDraftType] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const options = [...vocabulary, ...types.filter((t) => !vocabulary.includes(t))];

  function reset() {
    setSide("long");
    setTypes([]);
    setDraftType("");
    setReason("");
    setOpen(false);
  }

  async function save() {
    if (!reason.trim() || saving) return;
    setSaving(true);
    await createTradeIdea({ itemId, market, day, side, tradeTypes: types, reason });
    setSaving(false);
    reset();
    onChanged();
  }

  return (
    <div style={{ padding: "0 8px 12px 40px" }}>
      {ideas.map((idea) => {
        const long = idea.side !== "short";
        return (
          <div
            key={idea.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "9px 12px",
              marginBottom: 6,
              border: "1px solid oklch(0.3 0.034 250)",
              background: "oklch(0.17 0.03 250 / 0.6)",
              clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)",
            }}
          >
            <span
              style={{
                ...mono,
                fontSize: 10,
                flex: "none",
                marginTop: 1,
                padding: "2px 9px",
                borderRadius: 999,
                border: `1px solid ${long ? winColor : lossColor}`,
                color: long ? winColor : lossColor,
              }}
            >
              {long ? "LONG" : "SHORT"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {parseTagArray(idea.tradeTypes).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                  {parseTagArray(idea.tradeTypes).map((t) => {
                    const tone = tagTone(t);
                    return (
                      <span
                        key={t}
                        style={{ ...mono, fontSize: 9.5, padding: "2px 8px", borderRadius: 999, border: `1px solid ${tone.line}`, background: tone.bg, color: tone.fg }}
                      >
                        {t}
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 13, color: "oklch(0.85 0.017 250)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {idea.reason}
              </div>
            </div>
            <span
              onClick={async () => {
                await deleteTradeIdea(idea.id);
                onChanged();
              }}
              title="Supprimer cette idée"
              style={{ flex: "none", fontSize: 12, color: "oklch(0.5 0.034 250)", cursor: "pointer" }}
            >
              ✕
            </span>
          </div>
        );
      })}

      {!open ? (
        <span
          onClick={() => setOpen(true)}
          style={{
            ...mono,
            fontSize: 11,
            padding: "5px 12px",
            borderRadius: 999,
            border: `1px dashed ${accentColor}`,
            color: accentColor,
            cursor: "pointer",
            display: "inline-block",
          }}
        >
          + Ajouter une idée de trade
        </span>
      ) : (
        <div
          style={{
            padding: 12,
            border: `1px solid oklch(0.84 0.17 196 / 0.35)`,
            background: "oklch(0.84 0.17 196 / 0.05)",
            clipPath: "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)",
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <SideChip side="long" on={side === "long"} onClick={() => setSide("long")} />
            <SideChip side="short" on={side === "short"} onClick={() => setSide("short")} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {options.map((option) => (
              <TypeChip
                key={option}
                value={option}
                on={types.includes(option)}
                onClick={() => setTypes((prev) => (prev.includes(option) ? prev.filter((t) => t !== option) : [...prev, option]))}
              />
            ))}
            <input
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const value = draftType.trim();
                setDraftType("");
                if (value && !types.includes(value)) setTypes((prev) => [...prev, value]);
              }}
              placeholder="+ type"
              style={{
                ...mono,
                fontSize: 10.5,
                width: 90,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px dashed oklch(0.34 0.02 250)",
                background: "transparent",
                color: "oklch(0.85 0.017 250)",
                outline: "none",
              }}
            />
          </div>

          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Quand le marché arrive sur mon dernier top, j'attends la confirmation puis…"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "inherit",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid oklch(0.32 0.034 250)",
              background: "oklch(0.16 0.03 250)",
              color: "oklch(0.88 0.017 250)",
              outline: "none",
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <span
              onClick={save}
              style={{
                ...mono,
                fontSize: 11,
                padding: "5px 14px",
                borderRadius: 6,
                cursor: reason.trim() ? "pointer" : "default",
                border: `1px solid ${reason.trim() ? accentColor : "oklch(0.34 0.034 250)"}`,
                background: reason.trim() ? "oklch(0.84 0.17 196 / 0.16)" : "transparent",
                color: reason.trim() ? accentColor : "oklch(0.45 0.03 250)",
              }}
            >
              {saving ? "…" : "Enregistrer"}
            </span>
            <span
              onClick={reset}
              style={{ ...mono, fontSize: 11, padding: "5px 12px", color: "oklch(0.6 0.03 250)", cursor: "pointer" }}
            >
              annuler
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
