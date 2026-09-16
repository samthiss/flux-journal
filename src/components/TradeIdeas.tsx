"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { accentColor, winColor, lossColor } from "@/lib/theme";
import { tagTone, parseTagArray, kindPourSetup, SETUPS } from "@/lib/tags";
import { compressImage } from "@/lib/compressImage";
import ImageLightbox from "@/components/ImageLightbox";
import { createTradeIdea, updateTradeIdea, deleteTradeIdea, removeTradeIdeaImage, ajouterMot, supprimerMot, renommerMot, setTradeIdeaStatus } from "@/lib/actions/tradeIdeas";

export type TradeIdeaRecord = {
  id: string;
  itemId: string;
  side: string;
  tradeTypes: string | null;
  zone: string | null;
  setup: string | null;
  confirmations: string | null;
  confirmationsBox: string | null;
  confirmationsReverse: string | null;
  reason: string;
  cancelIf: string | null;
  images: string | null;
  /** "plan" while it is only written, "position" once it has been taken. */
  status?: string;
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

export type TradeVocabularies = {
  tradeTypes: string[];
  zones: string[];
  confirmations: string[];
  confirmationsBox: string[];
  confirmationsReverse: string[];
  cancelIfs: string[];
  /** The same three lists again, keyed "list@setup". */
  parSetup: Record<string, string[]>;
};

/**
 * The three confirmation lists, as the notes name them.
 *
 * One list held what the cluster, the box and the reverse chart each said, and
 * a single pile of words answers none of the three questions on its own. The
 * CC list keeps the `confirmations` field it has always had, so what was
 * written before is still where it was written.
 */
const CONFIRMATIONS = [
  { kind: "confirmations", titre: "Confirmation CC" },
  { kind: "confirmationsBox", titre: "Confirmation Box cluster" },
  { kind: "confirmationsReverse", titre: "Confirmation Reverse chart" },
] as const;

type ConfirmationKind = (typeof CONFIRMATIONS)[number]["kind"];

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
 * The setup this idea is for, offered rather than imposed.
 *
 * It starts on the one the line stands for — an idea under "Trend Run (TR)" is
 * a trend run — but it can be turned off, and turning it off is what puts the
 * whole vocabulary back under each confirmation list. Some mornings the useful
 * list is the long one.
 */
function SetupChip({ setup, on, onClick }: { setup: string; on: boolean; onClick: () => void }) {
  const tone = tagTone(setup);
  return (
    <span
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 11,
        padding: "4px 14px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px ${on ? "solid" : "dashed"} ${on ? tone.line : "oklch(0.38 0.034 250)"}`,
        background: on ? tone.bg : "transparent",
        color: on ? tone.fg : "oklch(0.62 0.034 250)",
      }}
    >
      {setup}
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
/**
 * A short list of words, ticked from what has been written before.
 *
 * The words are shown rather than hidden behind a dropdown: a list of four
 * confirmations is quicker to read than to open, and seeing them is what stops
 * the same one being written a second time in different words. Anything new is
 * typed into the same row and joins the list for next time, since the
 * vocabulary offered here is built from what past ideas carry.
 */
function MotsLibres({
  titre,
  valeurs,
  connus,
  kind,
  onChange,
}: {
  titre: string;
  valeurs: string[];
  connus: string[];
  /** Where a newly written word is kept, so it outlives this form. */
  kind?: string;
  onChange: (valeurs: string[]) => void;
}) {
  const [brouillon, setBrouillon] = useState("");
  const [ecrits, setEcrits] = useState<string[]>([]);
  /** The word being rewritten, and what it is being rewritten to. */
  const [renomme, setRenomme] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [retires, setRetires] = useState<string[]>([]);
  const tous = [...new Set([...valeurs, ...ecrits, ...connus])].filter((mot) => !retires.includes(mot));

  const ajouter = () => {
    const mot = brouillon.trim();
    setBrouillon("");
    if (!mot || valeurs.includes(mot)) return;
    // Written down at once, and shown here even if it is unticked again: a word
    // that only survived by being saved on an idea had to be retyped — and
    // retyped is respelt, which no count can put back together.
    setEcrits((prev) => (prev.includes(mot) ? prev : [...prev, mot]));
    if (kind) void ajouterMot(kind, mot);
    onChange([...valeurs, mot]);
  };

  return (
    // Framed like the cancel conditions: three lists of the same nature, and
    // two of them drawn as bare rows read as leftovers beside the third.
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 4,
        border: `1px solid ${accentColor.replace(")", " / 0.35)")}`,
        background: accentColor.replace(")", " / 0.05)"),
      }}
    >
      <div
        style={{
          ...mono,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: accentColor,
          marginBottom: 8,
        }}
      >
        {titre}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {tous.map((mot) => {
          const choisi = valeurs.includes(mot);
          const tone = tagTone(mot);

          // Rewritten in place, and everywhere at once: the point of keeping a
          // word is that one spelling of it exists, so correcting it here
          // corrects it on the trades that carry it.
          if (renomme === mot) {
            return (
              <input
                key={mot}
                autoFocus
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenomme(null);
                  if (e.key !== "Enter") return;
                  const suivant = nouveauNom.trim();
                  setRenomme(null);
                  if (!suivant || suivant === mot || !kind) return;
                  setEcrits((prev) => [...prev.filter((v) => v !== mot), suivant]);
                  setRetires((prev) => [...prev, mot]);
                  onChange(valeurs.map((v) => (v === mot ? suivant : v)));
                  void renommerMot(kind, mot, suivant);
                }}
                onBlur={() => setRenomme(null)}
                style={{ ...mono, fontSize: 10, padding: "3px 9px", borderRadius: 999, border: `1px solid ${accentColor}`, background: "transparent", color: "oklch(0.88 0.02 250)", outline: "none", width: 160 }}
              />
            );
          }

          return (
            <span
              key={mot}
              onClick={() => onChange(choisi ? valeurs.filter((v) => v !== mot) : [...valeurs, mot])}
              onDoubleClick={() => {
                if (!kind) return;
                setRenomme(mot);
                setNouveauNom(mot);
              }}
              title={kind ? "Double-clic pour renommer" : undefined}
              style={{
                ...mono,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                padding: "3px 9px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px ${choisi ? "solid" : "dashed"} ${choisi ? tone.line : "oklch(0.34 0.02 250)"}`,
                background: choisi ? tone.bg : "transparent",
                color: choisi ? tone.fg : "oklch(0.6 0.02 250)",
              }}
            >
              {choisi ? "✓ " : ""}
              {mot}
              {kind && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setRetires((prev) => [...prev, mot]);
                    onChange(valeurs.filter((v) => v !== mot));
                    void supprimerMot(kind, mot);
                  }}
                  title="Retirer de la liste"
                  style={{ opacity: 0.55 }}
                >
                  ✕
                </span>
              )}
            </span>
          );
        })}
        <input
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            ajouter();
          }}
          onBlur={ajouter}
          placeholder="ajouter…"
          style={{
            ...mono,
            fontSize: 10,
            padding: "3px 9px",
            borderRadius: 999,
            border: "1px dashed oklch(0.34 0.02 250)",
            background: "transparent",
            color: "oklch(0.8 0.02 250)",
            outline: "none",
            width: 110,
          }}
        />
      </div>
    </div>
  );
}

export default function TradeIdeas({
  itemId,
  market,
  day,
  setup,
  ideas,
  vocabulary,
  onChanged,
  lectureSeule = false,
}: {
  itemId: string;
  market: string;
  day: string;
  /**
   * The setup this line stands for, when it stands for one.
   *
   * Nothing is picked: an idea written under "Trend Run (TR)" is a trend run,
   * and that is what the confirmation lists are scoped by — the words offered
   * are the ones this setup has already used.
   */
  setup?: string | null;
  ideas: TradeIdeaRecord[];
  vocabulary: TradeVocabularies;
  onChanged: () => void;
  /**
   * Shows the ideas without offering to write one.
   *
   * The positions are read on the discipline page, where nothing new is
   * planned: a trade is decided among the strategies and only then taken.
   */
  lectureSeule?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The idea the form is rewriting, if it is not writing a new one. The same
  // form serves both: the fields are identical, and two of them would drift.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [side, setSide] = useState<"long" | "short">("long");
  const [types, setTypes] = useState<string[]>([]);
  const [zone, setZone] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<Record<ConfirmationKind, string[]>>({
    confirmations: [],
    confirmationsBox: [],
    confirmationsReverse: [],
  });
  // Which setup the lists are scoped to. It starts on the line's own, and a
  // second click on it clears it — which is how the whole vocabulary comes
  // back under each list.
  const [setupChoisi, setSetupChoisi] = useState<string | null>(setup ?? null);
  const [reason, setReason] = useState("");
  // One empty line to start: the box is a list, and a list with no line in it
  // has nothing to type into.
  const [cancelIf, setCancelIf] = useState<string[]>([]);
  const [nouvelleCondition, setNouvelleCondition] = useState("");
  /** Conditions written in this form, kept on screen even once unticked. */
  const [conditionsEcrites, setConditionsEcrites] = useState<string[]>([]);
  const [conditionsRetirees, setConditionsRetirees] = useState<string[]>([]);
  const [conditionRenommee, setConditionRenommee] = useState<string | null>(null);
  const [nouveauNomCondition, setNouveauNomCondition] = useState("");
  const [saving, setSaving] = useState(false);
  // Charts picked while writing, held until the idea they belong to exists.
  const [pending, setPending] = useState<{ file: File; preview: string }[]>([]);
  const [dropping, setDropping] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The line to put the cursor on once it exists. Focusing on the next frame
  // instead lost the first characters of a fast line to the field above: the
  // ref callback runs as the field is created, which is before the next
  // keystroke can be delivered.
  const [zoomed, setZoomed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);


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

  /** Sends everything picked in the form, one at a time, to the idea it is for. */
  async function uploadPending(ideaId: string) {
    for (const { file } of pending) {
      try {
        await upload(ideaId, file);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "image refusée");
      }
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
    setConfirmations({ confirmations: [], confirmationsBox: [], confirmationsReverse: [] });
    setSetupChoisi(setup ?? null);
    setReason("");
    setOpen(false);
    setEditingId(null);
  }

  /** Opens the form on an idea already written, with what it says in it. */
  function startEditing(idea: TradeIdeaRecord) {
    setSide(idea.side === "short" ? "short" : "long");
    setSetupChoisi(idea.setup ?? setup ?? null);
    setTypes(parseTagArray(idea.tradeTypes));
    setZone(idea.zone);
    setConfirmations({
      confirmations: parseTagArray(idea.confirmations),
      confirmationsBox: parseTagArray(idea.confirmationsBox),
      confirmationsReverse: parseTagArray(idea.confirmationsReverse),
    });
    setReason(idea.reason);
    const lines = parseTagArray(idea.cancelIf);
    setCancelIf(lines.length ? lines : [""]);
    setUploadError(null);
    setEditingId(idea.id);
    setOpen(false);
  }

  /** Something was said: the form is worth saving. */
  const filled =
    reason.trim().length > 0 ||
    types.length > 0 ||
    !!zone ||
    CONFIRMATIONS.some(({ kind }) => confirmations[kind].length > 0) ||
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

    if (editingId) {
      await updateTradeIdea(editingId, { side, setup: setupChoisi, tradeTypes: types, zone, ...confirmations, reason, cancelIf });
      // Charts picked while rewriting go up too. Leaving this out is what made
      // an image added from the edit form vanish on save.
      await uploadPending(editingId);
      setSaving(false);
      reset();
      onChanged();
      return;
    }

    const idea = await createTradeIdea({
      itemId,
      market,
      day,
      side,
      setup: setupChoisi,
      tradeTypes: types,
      zone,
      ...confirmations,
      reason,
      cancelIf,
      withImages: pending.length > 0,
    });
    if (idea) await uploadPending(idea.id);
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

  // The one form, for a new idea and for rewriting one: the fields are the
  // same, and two of them would drift apart.
  const form = (
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
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <SideChip side="long" on={side === "long"} onClick={() => setSide("long")} />
            <SideChip side="short" on={side === "short"} onClick={() => setSide("short")} />
            <span style={{ width: 10 }} />
            {/* The line's own setup first, then the other: an idea is usually
                for the setup it was written under, and occasionally not. */}
            {[...new Set([...(setup ? [setup] : []), ...SETUPS])].map((nom) => (
              <SetupChip
                key={nom}
                setup={nom}
                on={setupChoisi === nom}
                onClick={() => setSetupChoisi((prev) => (prev === nom ? null : nom))}
              />
            ))}
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
  
          {/* Below the case, not above it: the words come out of writing it.
              Typed rather than picked, and kept — what is written here is
              offered next time, which is how the vocabulary builds itself
              instead of being decided in advance. */}
          <MotsLibres
            titre="Type"
            valeurs={types}
            connus={vocabulary.tradeTypes}
            onChange={setTypes}
          />
          {/* CC first, then the box and the reverse chart under it: three
              lists rather than one, because they answer three questions. */}
          {CONFIRMATIONS.map(({ kind, titre }) => {
            // The words this setup has used, or all of them while it has used
            // none: an empty row on the first trade reads as a fault.
            const propres = vocabulary.parSetup[kindPourSetup(kind, setupChoisi)] ?? [];
            return (
            <MotsLibres
              key={kind}
              titre={setupChoisi ? `${titre} · ${setupChoisi}` : titre}
              valeurs={confirmations[kind]}
              connus={setupChoisi && propres.length ? propres : vocabulary[kind]}
              kind={kindPourSetup(kind, setupChoisi)}
              onChange={(valeurs) => setConfirmations((prev) => ({ ...prev, [kind]: valeurs }))}
            />
            );
          })}

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
            {/* Ticked, not retyped. The same few conditions come back — the
                zone breaks, no cluster forms — and typing them again each time
                produced three wordings of one rule, which no filter can gather
                back together. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {/* Everything written before, ticked or not: a condition that
                  only lived on the idea that used it had to be retyped for the
                  next trade, and retyped is respelt. */}
              {[...new Set([...cancelIf.filter(Boolean), ...conditionsEcrites, ...vocabulary.cancelIfs])]
                .filter((condition) => !conditionsRetirees.includes(condition))
                .map((condition) => {
                  const coche = cancelIf.includes(condition);

                  if (conditionRenommee === condition) {
                    return (
                      <input
                        key={condition}
                        autoFocus
                        value={nouveauNomCondition}
                        onChange={(e) => setNouveauNomCondition(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setConditionRenommee(null);
                          if (e.key !== "Enter") return;
                          const suivant = nouveauNomCondition.trim();
                          setConditionRenommee(null);
                          if (!suivant || suivant === condition) return;
                          setConditionsEcrites((prev) => [...prev.filter((c) => c !== condition), suivant]);
                          setConditionsRetirees((prev) => [...prev, condition]);
                          setCancelIf((prev) => prev.map((c) => (c === condition ? suivant : c)));
                          void renommerMot("cancelIf", condition, suivant);
                        }}
                        onBlur={() => setConditionRenommee(null)}
                        style={{ ...mono, fontSize: 10, padding: "3px 9px", borderRadius: 999, border: `1px solid ${lossColor}`, background: "transparent", color: "oklch(0.88 0.02 250)", outline: "none", width: 190 }}
                      />
                    );
                  }

                  return (
                    <span
                      key={condition}
                      onClick={() =>
                        setCancelIf((prev) =>
                          prev.includes(condition) ? prev.filter((c) => c !== condition) : [...prev.filter(Boolean), condition],
                        )
                      }
                      onDoubleClick={() => {
                        setConditionRenommee(condition);
                        setNouveauNomCondition(condition);
                      }}
                      title="Double-clic pour renommer"
                      style={{
                        ...mono,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 10,
                        padding: "3px 9px",
                        borderRadius: 999,
                        cursor: "pointer",
                        border: `1px ${coche ? "solid" : "dashed"} ${coche ? lossColor : "oklch(0.34 0.02 250)"}`,
                        background: coche ? lossColor.replace(")", " / 0.14)") : "transparent",
                        color: coche ? lossColor : "oklch(0.6 0.02 250)",
                      }}
                    >
                      {coche ? "✓ " : ""}
                      {condition}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setConditionsRetirees((prev) => [...prev, condition]);
                          setCancelIf((prev) => prev.filter((c) => c !== condition));
                          void supprimerMot("cancelIf", condition);
                        }}
                        title="Retirer de la liste"
                        style={{ opacity: 0.55 }}
                      >
                        ✕
                      </span>
                    </span>
                  );
                })}
              <input
                value={nouvelleCondition}
                onChange={(e) => setNouvelleCondition(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const mot = nouvelleCondition.trim();
                  setNouvelleCondition("");
                  if (!mot) return;
                  setConditionsEcrites((prev) => (prev.includes(mot) ? prev : [...prev, mot]));
                  void ajouterMot("cancelIf", mot);
                  if (!cancelIf.includes(mot)) setCancelIf((prev) => [...prev.filter(Boolean), mot]);
                }}
                // Not an example condition: beside the real ones, a greyed
                // "le marché casse la zone" read as a fourth chip nobody had
                // written.
                placeholder="ajouter une condition…"
                style={{
                  ...mono,
                  fontSize: 10,
                  padding: "3px 9px",
                  borderRadius: 999,
                  border: "1px dashed oklch(0.34 0.02 250)",
                  background: "transparent",
                  color: "oklch(0.8 0.02 250)",
                  outline: "none",
                  width: 170,
                }}
              />
            </div>
          </div>
  
          {/* Charts chosen now, uploaded once the idea they belong to exists. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
            {pending.map((p) => (
              <span key={p.preview} style={{ position: "relative", display: "inline-flex" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview has no known dimensions */}
                <img
                  src={p.preview}
                  alt=""
                  onClick={() => setZoomed(p.preview)}
                  style={{ height: 46, borderRadius: 4, border: "1px solid oklch(0.34 0.034 250)", cursor: "zoom-in" }}
                />
                <span
                  onClick={() => {
                    URL.revokeObjectURL(p.preview);
                    setPending((prev) => prev.filter((x) => x.preview !== p.preview));
                  }}
                  title="Retirer cette image"
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 17,
                    height: 17,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    borderRadius: 999,
                    background: "oklch(0.18 0.03 250)",
                    border: "1px solid oklch(0.42 0.034 250)",
                    color: "oklch(0.8 0.02 250)",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </span>
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
  );

  return (
    <div style={{ padding: "0 8px 12px 40px" }}>
      {/* A chart picked but not yet saved opens the same way a saved one does. */}
      <ImageLightbox url={zoomed} onClose={() => setZoomed(null)} />
      {ideas.map((idea) => {
        const long = idea.side !== "short";
        // Rewritten in place, so the reader stays where the idea is rather than
        // following a form to the bottom of the list.
        if (editingId === idea.id) return <div key={idea.id}>{form}</div>;
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
            {/* Where the trade stands, picked rather than toggled. It was two
                chips — one that flipped between plan and trading, one that
                closed the position — and three states cannot be read off two
                buttons: a card in Pre Trade Check showed "Clôturé" with no way
                back. A list says what the states are and which one this is. */}
            <select
              value={idea.status === "closed" ? "closed" : idea.status === "position" ? "position" : "plan"}
              onChange={(e) => void setTradeIdeaStatus(idea.id, e.target.value as "plan" | "position" | "closed").then(onChanged)}
              title="Où en est ce trade"
              style={{
                ...mono,
                fontSize: 9.5,
                flex: "none",
                marginTop: 1,
                padding: "2px 6px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px ${idea.status === "plan" ? "dashed" : "solid"} ${idea.status === "plan" ? "oklch(0.34 0.02 250)" : accentColor}`,
                background: idea.status === "plan" ? "transparent" : accentColor.replace(")", " / 0.14)"),
                color: idea.status === "plan" ? "oklch(0.6 0.02 250)" : accentColor,
                outline: "none",
              }}
            >
              <option value="plan">Trading plan</option>
              <option value="position">Trading</option>
              <option value="closed">Position closed</option>
            </select>

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
              {[...(idea.setup ? [idea.setup] : []), ...parseTagArray(idea.tradeTypes), ...(idea.zone ? [idea.zone] : []), ...parseTagArray(idea.confirmations), ...parseTagArray(idea.confirmationsBox), ...parseTagArray(idea.confirmationsReverse)].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 5 }}>
                  {[...(idea.setup ? [idea.setup] : []), ...parseTagArray(idea.tradeTypes), ...(idea.zone ? [idea.zone] : []), ...parseTagArray(idea.confirmations), ...parseTagArray(idea.confirmationsBox), ...parseTagArray(idea.confirmationsReverse)].map((t) => {
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
              onClick={() => startEditing(idea)}
              title="Modifier cette idée"
              style={{ flex: "none", fontSize: 11, color: "oklch(0.5 0.034 250)", cursor: "pointer", marginRight: 2 }}
            >
              ✎
            </span>
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

      {lectureSeule ? null : !open || editingId ? (
        <span
          onClick={() => {
            // Starting a new one puts down whatever was being rewritten.
            reset();
            setOpen(true);
          }}
          style={{
            ...mono,
            fontSize: 11,
            padding: "5px 12px",
            borderRadius: 999,
            border: `1px dashed ${accentColor}`,
            color: accentColor,
            cursor: "pointer",
            display: "inline-block",
            // Clear of whatever is above it — an idea's card, or the form's own
            // "Enregistrer" while one is being rewritten in place.
            marginTop: 14,
          }}
        >
          + Ajouter une idée de trade
        </span>
      ) : (
        form
      )}
    </div>
  );
}
