"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { accentColor, winColor, lossColor } from "@/lib/theme";
import { tagTone, parseTagArray } from "@/lib/tags";
import { compressImage } from "@/lib/compressImage";
import ChipDropdown from "@/components/ChipDropdown";
import ImageLightbox from "@/components/ImageLightbox";
import { createTradeIdea, deleteTradeIdea, removeTradeIdeaImage } from "@/lib/actions/tradeIdeas";

export type TradeIdeaRecord = {
  id: string;
  itemId: string;
  side: string;
  tradeTypes: string | null;
  zone: string | null;
  confirmations: string | null;
  reason: string;
  cancelIf: string | null;
  images: string | null;
};

type IdeaImage = { url: string; width: number | null; height: number | null };

function parseImages(raw: string | null): IdeaImage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.url === "string") : [];
  } catch {
    return [];
  }
}

/** The same ceiling the note examples upload under, for the same network. */
const MAX_IMAGE_BYTES = 900_000;

export type TradeVocabularies = { tradeTypes: string[]; zones: string[]; confirmations: string[] };

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

/**
 * The charts on a saved idea, and the button that adds one.
 *
 * Thumbnails at a fixed height rather than a grid: an idea carries a screenshot
 * of the setup, and the card it sits on is a line of the checklist, not a page.
 */
function IdeaImages({
  idea,
  onAdd,
  onChanged,
}: {
  idea: TradeIdeaRecord;
  onAdd: (files: File[]) => void;
  onChanged: () => void;
}) {
  const images = parseImages(idea.images);
  const fileRef = useRef<HTMLInputElement>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [folded, setFolded] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(false);
        onAdd([...e.dataTransfer.files]);
      }}
      style={{
        marginTop: 8,
        // Lit while a file is over it, so the row says it will take the drop.
        padding: dropping ? 5 : 0,
        border: dropping ? `1px dashed ${accentColor}` : "1px solid transparent",
        borderRadius: 4,
        background: dropping ? "oklch(0.84 0.17 196 / 0.1)" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: images.length && !folded ? 8 : 0 }}>
        {images.length > 0 && (
          <span
            onClick={() => setFolded((f) => !f)}
            title={folded ? "Afficher les images" : "Masquer les images"}
            style={{
              ...mono,
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 999,
              border: "1px solid oklch(0.32 0.02 250)",
              color: "oklch(0.6 0.02 250)",
              cursor: "pointer",
            }}
          >
            {folded ? "▸" : "▾"} {images.length} image{images.length > 1 ? "s" : ""}
          </span>
        )}
        <span
          onClick={() => fileRef.current?.click()}
          style={{
            ...mono,
            fontSize: 10,
            padding: "3px 10px",
            borderRadius: 999,
            border: "1px dashed oklch(0.32 0.02 250)",
            color: "oklch(0.55 0.02 250)",
            cursor: "pointer",
          }}
        >
          + image
        </span>
      </div>

      {/* One per row, the full width of the card: a chart squeezed into a
          thumbnail shows nothing, and there is nothing to compare side by side
          here — an idea carries the setup, not a gallery. */}
      {!folded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {images.map((image) => (
            <span key={image.url} style={{ position: "relative", display: "block" }}>
              <Image
                src={image.url}
                alt=""
                // The uploads are served by our own route, which resizes on
                // `?w=`; the built-in optimiser cannot read them and answers
                // 400. The stored dimensions are passed so the row can reserve
                // its height before the image arrives.
                loader={({ src, width }) => `${src}?w=${width}`}
                sizes="(max-width: 900px) 90vw, 900px"
                width={image.width ?? 0}
                height={image.height ?? 0}
                onClick={() => setZoomed(image.url)}
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: 4,
                  border: "1px solid oklch(0.3 0.034 250)",
                  cursor: "zoom-in",
                }}
              />
              <span
                onClick={async () => {
                  await removeTradeIdeaImage(idea.id, image.url);
                  onChanged();
                }}
                title="Retirer cette image"
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  borderRadius: 999,
                  background: "oklch(0.15 0.03 250 / 0.85)",
                  border: "1px solid oklch(0.4 0.034 250)",
                  color: "oklch(0.8 0.02 250)",
                  cursor: "pointer",
                }}
              >
                ✕
              </span>
            </span>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onAdd([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {/* Through the portal ImageLightbox opens, and it has to: the card is a
          glassCard, whose backdrop-filter makes it the containing block for
          anything fixed inside it — an overlay rendered in place would be
          trapped in the card rather than covering the page. */}
      <ImageLightbox url={zoomed} onClose={() => setZoomed(null)} />
    </div>
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
  vocabulary: TradeVocabularies;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"long" | "short">("long");
  const [types, setTypes] = useState<string[]>([]);
  const [zone, setZone] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  // One empty line to start: the box is a list, and a list with no line in it
  // has nothing to type into.
  const [cancelIf, setCancelIf] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  // Charts picked while writing, held until the idea they belong to exists.
  const [pending, setPending] = useState<{ file: File; preview: string }[]>([]);
  const [dropping, setDropping] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The line to put the cursor on once it exists. Focusing on the next frame
  // instead lost the first characters of a fast line to the field above: the
  // ref callback runs as the field is created, which is before the next
  // keystroke can be delivered.
  const [focusCancel, setFocusCancel] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** A word typed a moment ago is offered too, before the list is read again. */
  const offer = (known: string[], picked: string[]) => [...known, ...picked.filter((v) => !known.includes(v))];

  /**
   * Sends one chart to an idea that already exists.
   *
   * Compressed first, and one at a time by the caller: this network path does
   * not carry much more than a megabyte at once, which is what makes a request
   * hang instead of failing (see src/lib/compressImage.ts).
   */
  async function upload(ideaId: string, file: File) {
    let payload = file;
    try {
      payload = await compressImage(file, MAX_IMAGE_BYTES);
    } catch {
      // Undecodable: send it as-is and let the size check on the server speak.
    }
    const fd = new FormData();
    fd.append("ideaId", ideaId);
    fd.append("image", payload);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }));
      throw new Error(error ?? "image refusée");
    }
  }

  function addPending(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setPending((prev) => [...prev, ...images.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  function reset() {
    setPending((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
    setUploadError(null);
    setCancelIf([""]);
    setSide("long");
    setTypes([]);
    setZone(null);
    setConfirmations([]);
    setReason("");
    setOpen(false);
  }

  /** Something was said: the form is worth saving. */
  const filled =
    reason.trim().length > 0 ||
    types.length > 0 ||
    !!zone ||
    confirmations.length > 0 ||
    cancelIf.some((line) => line.trim()) ||
    pending.length > 0;

  async function save() {
    if (saving) return;
    if (!filled) {
      // It used to return here in silence, which read as a broken button.
      setUploadError("Écris au moins une ligne, un tag ou une condition.");
      return;
    }
    setSaving(true);
    const idea = await createTradeIdea({
      itemId,
      market,
      day,
      side,
      tradeTypes: types,
      zone,
      confirmations,
      reason,
      cancelIf,
      withImages: pending.length > 0,
    });
    if (idea) {
      for (const { file } of pending) {
        try {
          await upload(idea.id, file);
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : "image refusée");
        }
      }
    }
    setSaving(false);
    reset();
    onChanged();
  }

  /** Adds charts to an idea already written, from its own button. */
  async function addImagesTo(ideaId: string, files: File[]) {
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        await upload(ideaId, file);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "image refusée");
      }
    }
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
              {[...parseTagArray(idea.tradeTypes), ...(idea.zone ? [idea.zone] : []), ...parseTagArray(idea.confirmations)].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                  {[...parseTagArray(idea.tradeTypes), ...(idea.zone ? [idea.zone] : []), ...parseTagArray(idea.confirmations)].map((t) => {
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
              {idea.reason.trim() && (
                <div style={{ fontSize: 13, color: "oklch(0.85 0.017 250)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {idea.reason}
                </div>
              )}
              {parseTagArray(idea.cancelIf).length > 0 && (
                <div style={{ marginTop: 7, paddingLeft: 2 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: lossColor, marginBottom: 3 }}>
                    Annuler si :
                  </div>
                  {parseTagArray(idea.cancelIf).map((line) => (
                    <div key={line} style={{ display: "flex", gap: 7, fontSize: 12.5, color: "oklch(0.75 0.017 250)", lineHeight: 1.5 }}>
                      <span style={{ color: lossColor, flex: "none" }}>—</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}
              <IdeaImages idea={idea} onAdd={(files) => addImagesTo(idea.id, files)} onChanged={onChanged} />
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
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            if (!dropping) setDropping(true);
          }}
          onDragLeave={(e) => {
            // Only when the pointer leaves the form itself: moving over a field
            // inside it fires this too, and the frame would flicker.
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDropping(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(false);
            addPending([...e.dataTransfer.files]);
          }}
          style={{
            padding: 12,
            border: `1px ${dropping ? "dashed" : "solid"} ${dropping ? accentColor : "oklch(0.84 0.17 196 / 0.35)"}`,
            background: dropping ? "oklch(0.84 0.17 196 / 0.12)" : "oklch(0.84 0.17 196 / 0.05)",
            // No cut corners here, unlike the panels elsewhere: clip-path also
            // clips what overflows, and the tag lists open downward out of this
            // frame — bevelled, half of each list was sliced off.
            borderRadius: 4,
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <SideChip side="long" on={side === "long"} onClick={() => setSide("long")} />
            <SideChip side="short" on={side === "short"} onClick={() => setSide("short")} />
          </div>

          {/* The same dropdowns the note examples are annotated with, on the
              same words: a type or a confirmation written here is one the
              examples will offer next time. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <ChipDropdown
              placeholder="Type"
              options={offer(vocabulary.tradeTypes, types)}
              selected={types}
              multiple
              visible
              onToggle={(value) =>
                setTypes((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]))
              }
              onAdd={(value) => setTypes((prev) => (prev.includes(value) ? prev : [...prev, value]))}
            />
            <ChipDropdown
              placeholder="Zone"
              options={offer(vocabulary.zones, zone ? [zone] : [])}
              selected={zone ? [zone] : []}
              visible
              onToggle={(value) => setZone((prev) => (prev === value ? null : value))}
              onAdd={(value) => setZone(value)}
            />
            <ChipDropdown
              placeholder="Confirmation"
              options={offer(vocabulary.confirmations, confirmations)}
              selected={confirmations}
              multiple
              visible
              onToggle={(value) =>
                setConfirmations((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]))
              }
              onAdd={(value) => setConfirmations((prev) => (prev.includes(value) ? prev : [...prev, value]))}
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

          {/* What would call the trade off, kept apart from the case for it. */}
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 4,
              border: `1px solid ${lossColor.replace(")", " / 0.4)")}`,
              background: lossColor.replace(")", " / 0.06)"),
            }}
          >
            <div style={{ ...mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: lossColor, marginBottom: 8 }}>
              Annuler mon trade si :
            </div>
            {cancelIf.map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ color: lossColor, fontSize: 12, flex: "none" }}>—</span>
                <input
                  value={line}
                  onChange={(e) =>
                    setCancelIf((prev) => prev.map((l, li) => (li === i ? e.target.value : l)))
                  }
                  onKeyDown={(e) => {
                    // Enter opens the next line, as a bullet list does anywhere
                    // else; backspace on an empty one closes it again.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setCancelIf((prev) => [...prev.slice(0, i + 1), "", ...prev.slice(i + 1)]);
                      setFocusCancel(i + 1);
                    }
                    if (e.key === "Backspace" && !line && cancelIf.length > 1) {
                      e.preventDefault();
                      setCancelIf((prev) => prev.filter((_, li) => li !== i));
                      setFocusCancel(Math.max(0, i - 1));
                    }
                  }}
                  ref={(el) => {
                    if (el && focusCancel === i) {
                      el.focus();
                      setFocusCancel(null);
                    }
                  }}
                  placeholder={i === 0 ? "le marché casse la zone" : ""}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    fontFamily: "inherit",
                    padding: "3px 0",
                    border: "none",
                    borderBottom: "1px solid oklch(0.3 0.034 250)",
                    background: "transparent",
                    color: "oklch(0.88 0.017 250)",
                    outline: "none",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Charts chosen now, uploaded once the idea they belong to exists. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
            {pending.map((p) => (
              <span
                key={p.preview}
                onClick={() => {
                  URL.revokeObjectURL(p.preview);
                  setPending((prev) => prev.filter((x) => x.preview !== p.preview));
                }}
                title="Retirer cette image"
                style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview has no known dimensions */}
                <img src={p.preview} alt="" style={{ height: 46, borderRadius: 4, border: "1px solid oklch(0.34 0.034 250)" }} />
              </span>
            ))}
            <span
              onClick={() => fileRef.current?.click()}
              style={{
                ...mono,
                fontSize: 10.5,
                padding: "4px 11px",
                borderRadius: 999,
                border: "1px dashed oklch(0.34 0.02 250)",
                color: "oklch(0.6 0.02 250)",
                cursor: "pointer",
              }}
            >
              + image
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addPending([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>

          {uploadError && (
            <div style={{ ...mono, fontSize: 10.5, color: lossColor, marginTop: 8 }}>{uploadError}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <span
              onClick={save}
              style={{
                ...mono,
                fontSize: 11,
                padding: "5px 14px",
                borderRadius: 6,
                cursor: "pointer",
                border: `1px solid ${filled ? accentColor : "oklch(0.34 0.034 250)"}`,
                background: filled ? "oklch(0.84 0.17 196 / 0.16)" : "transparent",
                color: filled ? accentColor : "oklch(0.45 0.03 250)",
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
