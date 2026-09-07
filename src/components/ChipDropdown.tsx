"use client";

import { useRef, useState } from "react";
import { accentColor } from "@/lib/theme";
import { tagTone } from "@/lib/tags";
import { useMenuDismiss } from "@/components/useMenuDismiss";

/**
 * What the trade was. Several can be true of the same trade — a rebound inside
 * a range taken against the trend is all three at once — so these are ticked,
 * not picked, and the list is fixed: it is a vocabulary, not free text.
 */
export default function ChipDropdown({
  placeholder,
  options,
  selected,
  multiple,
  visible,
  onToggle,
  onAdd,
  onRemoveOption,
  onRenameOption,
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
  /** Present when an option can be renamed wherever it is written. */
  onRenameOption?: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // The option being rewritten, if any, and what it is being rewritten to.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  useMenuDismiss(open, wrapper, () => setOpen(false));

  // Nothing answered and the pointer elsewhere: the card stays clean.
  if (!selected.length && !visible) return null;

  const tone = selected.length ? tagTone(selected[0]) : null;
  const label = selected.length ? selected.join(" · ") : placeholder;

  return (
    <div ref={wrapper} style={{ position: "relative", flex: "none" }}>
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
            const removable = onRemoveOption !== undefined;
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
                {renaming === option ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        const next = renameDraft.trim();
                        setRenaming(null);
                        if (next && next !== option) onRenameOption?.(option, next);
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      fontSize: 10.5,
                      padding: "2px 5px",
                      borderRadius: 4,
                      border: `1px solid ${accentColor}`,
                      background: "oklch(0.84 0.17 196 / 0.1)",
                      color: "oklch(0.92 0.017 250)",
                      outline: "none",
                    }}
                  />
                ) : (
                  <span style={{ flex: 1 }}>{option}</span>
                )}
                {onRenameOption && renaming !== option && (
                  <span
                    title="Renommer, partout où le tag est écrit"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameDraft(option);
                      setRenaming(option);
                    }}
                    style={{ fontSize: 10, opacity: 0.55 }}
                  >
                    ✎
                  </span>
                )}
                {removable && renaming !== option && (
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
