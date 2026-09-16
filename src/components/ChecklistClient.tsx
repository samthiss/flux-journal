"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useMenuDismiss } from "@/components/useMenuDismiss";
import { accentColor, glassCard } from "@/lib/theme";
import { PageTitle } from "@/components/NeonText";
import { createChecklistItem, deleteChecklistItem, renameChecklistItem, setChecklistItemOptions, setChecklistItemAllowsIdeas, renameChecklistGroup, renameChecklistCategory, deleteChecklistCategory, deleteChecklistGroup } from "@/lib/actions/checklist";
import { getTradeIdeas, getTradeVocabularies } from "@/lib/actions/tradeIdeas";
import TradeIdeas, { type TradeIdeaRecord, type TradeVocabularies } from "@/components/TradeIdeas";

type ChecklistItem = {
  id: string;
  group: string;
  label: string;
  /** A heading inside the group, or nothing. */
  category?: string | null;
  options?: string | null;
  allowsIdeas?: boolean;
};

/** The answers an item offers, if any. Stored as JSON, empty when malformed. */
type TypeDeBloc = "case" | "choix";

const BLOCS: { type: TypeDeBloc; label: string }[] = [
  { type: "case", label: "Case à cocher" },
  { type: "choix", label: "Liste de choix" },
];

/**
 * The "+ bloc" pill, borrowed from the notes.
 *
 * The same gesture builds a note and now builds a list: pick what to add, then
 * write it. What it replaces was three fields sitting in three different
 * places — one for a line, one for a heading, one for the answers — which had
 * to be found before anything could be written.
 */
function AjouterBloc({ types, onChoisir }: { types: TypeDeBloc[]; onChoisir: (type: TypeDeBloc) => void }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useMenuDismiss(open, wrapper, () => setOpen(false));

  return (
    <div ref={wrapper} style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={() => setOpen((o) => !o)}
        title="Ajouter un bloc"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 10,
          padding: "3px 10px",
          borderRadius: 999,
          border: "1px dashed oklch(0.34 0.034 250)",
          color: "oklch(0.6 0.034 250)",
          cursor: "pointer",
        }}
      >
        + bloc
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "130%",
            left: 0,
            zIndex: 30,
            background: "oklch(0.21 0.034 250)",
            border: "1px solid oklch(0.34 0.034 250)",
            borderRadius: 8,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            minWidth: 150,
            boxShadow: "0 10px 28px -8px oklch(0 0 0 / 0.55)",
          }}
        >
          {BLOCS.filter((bloc) => types.includes(bloc.type)).map((bloc) => (
            <span
              key={bloc.type}
              onClick={() => {
                onChoisir(bloc.type);
                setOpen(false);
              }}
              style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: "oklch(0.85 0.034 250)", whiteSpace: "nowrap" }}
            >
              {bloc.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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
  sections = [],
  builder = false,
}: {
  items: ChecklistItem[];
  market: string;
  title?: string;
  subtitle?: string;
  /**
   * Sections to draw even while they hold nothing.
   *
   * A group exists only through its lines — there is no group table — so a
   * section waiting to be filled would have nowhere to be filled from. Named
   * here, it appears with its own "add a line" box and becomes real with the
   * first line typed into it.
   */
  sections?: string[];
  /**
   * Builds the list the way a note is built: one "+ bloc" button per place,
   * instead of a field for lines, another for headings and a third for the
   * answers. Only the pre-trade lists use it — the older tabs hold data typed
   * the other way, and two ways of editing in one page would be worse than the
   * one that was there.
   */
  builder?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");

  /**
   * The block being written, if any: where it goes, and what kind it is.
   *
   * `cle` is the group, or "group::category" for a line under a heading.
   */
  const [bloc, setBloc] = useState<{ cle: string; type: TypeDeBloc; item?: ChecklistItem } | null>(null);
  const [blocLabel, setBlocLabel] = useState("");
  /** The heading this block sits under, typed with it. Optional. */
  const [blocTitre, setBlocTitre] = useState("");
  const [blocReponses, setBlocReponses] = useState("");
  const [newGroupItem, setNewGroupItem] = useState("");
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});
  const [ideas, setIdeas] = useState<TradeIdeaRecord[]>([]);
  const [vocabulary, setVocabulary] = useState<TradeVocabularies>({ tradeTypes: [], zones: [], confirmations: [] });
  // Bumped after a write, to read the ideas back rather than guess at them.
  const [ideasVersion, setIdeasVersion] = useState(0);

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

  // The ideas belong to a market and a day, and the market is chosen in the
  // browser, so the server that rendered the page could not have known which
  // ones to send.
  useEffect(() => {
    let alive = true;
    getTradeIdeas(market, todayKey()).then((rows) => {
      if (alive) setIdeas(rows);
    });
    getTradeVocabularies().then((values) => {
      if (alive) setVocabulary(values);
    });
    return () => {
      alive = false;
    };
  }, [market, ideasVersion]);

  const groups = Array.from(new Set([...sections, ...items.map((i) => i.group)])).map((group) => {
    const dedans = items.filter((i) => i.group === group);

    // Uncategorised lines first, then each heading in the order it appears.
    // Sorted here rather than in the query so the headings stay whole: a
    // category split in two by insertion order would read as two categories.
    const categories = [...new Set(dedans.map((i) => i.category ?? ""))].sort((a, b) =>
      a === "" ? -1 : b === "" ? 1 : 0,
    );

    return {
      title: group,
      items: categories.flatMap((categorie) => dedans.filter((i) => (i.category ?? "") === categorie)),
      categories,
    };
  });

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

  function renameGroup(group: string, name: string) {
    if (!name.trim() || name.trim() === group) return;
    startTransition(async () => {
      await renameChecklistGroup(group, name);
    });
  }

  /**
   * Deletes a group, once. It takes its items with it, and the trade ideas
   * written under them, so it asks first and says how much is going.
   */
  function removeGroup(group: string, count: number) {
    const question = `Supprimer « ${group} » et ses ${count} ligne${count > 1 ? "s" : ""} ?`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      await deleteChecklistGroup(group);
    });
  }

  /** `cle` is the group, or "group::category" when the line goes under one. */
  function addItem(cle: string) {
    const label = (newItemDrafts[cle] ?? "").trim();
    if (!label) return;
    const [group, categorie] = cle.split("::");
    setNewItemDrafts((d) => ({ ...d, [cle]: "" }));
    startTransition(async () => {
      await createChecklistItem(group, label, categorie);
    });
  }

  /** Writes the block being composed, whatever kind it is. */
  async function poserBloc() {
    if (!bloc) return;
    // A choice list is named once: its title is what is read above the
    // answers, so asking for a heading and a label was asking twice for the
    // same words.
    const label = (bloc.type === "choix" ? blocTitre : blocLabel).trim();
    if (!label) return;

    const [group, categorie] = bloc.cle.split("::");
    const reponses = blocReponses.split(/[\n/]/).map((r) => r.trim()).filter(Boolean);
    // A heading typed with the block, or the one it was added under.
    const titre = bloc.type === "choix" ? categorie : categorie || blocTitre.trim();

    setBloc(null);
    setBlocLabel("");
    setBlocTitre("");
    setBlocReponses("");

    // Editing an existing line goes through the same form, so what is written
    // and what is corrected look alike.
    if (bloc.item) {
      if (label !== bloc.item.label) await renameChecklistItem(bloc.item.id, label);
      await setChecklistItemOptions(bloc.item.id, reponses);
      return;
    }

    const cree = await createChecklistItem(group, label, titre);
    // The answers are set straight after, so a choice block is born as one
    // rather than as a tick box to be converted afterwards.
    if (cree && bloc.type === "choix" && reponses.length > 0) await setChecklistItemOptions(cree.id, reponses);
  }

  /** Drops a heading, asking first: it takes its lines with it, as a group does. */
  function removeCategorie(group: string, categorie: string, combien: number) {
    const question = `Supprimer « ${categorie} » et ses ${combien} ligne${combien > 1 ? "s" : ""} ?`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      await deleteChecklistCategory(group, categorie);
    });
  }

  function renameCategorie(group: string, from: string, to: string) {
    if (!to.trim() || to.trim() === from) return;
    startTransition(async () => {
      await renameChecklistCategory(group, from, to);
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

  /** Where a block is being written, if it is being written here. */
  const formulaire = (cle: string, titresConnus: string[] = []) => {
    if (!bloc || bloc.cle !== cle) return null;
    const champ = {
      width: "100%",
      boxSizing: "border-box" as const,
      fontSize: 13.5,
      color: "oklch(0.88 0.017 250)",
      background: "oklch(0.2 0.034 250)",
      border: "1px solid oklch(0.35 0.034 250)",
      borderRadius: 6,
      padding: "5px 8px",
      marginBottom: 6,
    };

    return (
      <div style={{ padding: "6px 0 10px", maxWidth: 460 }}>
        {/* Only when the block is not already under one: a heading is written
            with the block it introduces, rather than created on its own and
            then filled. */}
        {(bloc.type === "choix" || !cle.includes("::")) && (
          <input
            autoFocus={bloc.type === "choix"}
            value={blocTitre}
            onChange={(e) => setBlocTitre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBloc(null);
            }}
            placeholder={bloc.type === "choix" ? "Titre de la liste…" : "Titre (facultatif)"}
            // Suggests the headings already in this section, so a second line
            // joins the first one's title instead of being typed again — and
            // spelt differently, which would split the heading in two.
            list={titresConnus.length ? `titres-${cle}` : undefined}
            style={{ ...champ, fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", color: accentColor }}
          />
        )}
        {!cle.includes("::") && titresConnus.length > 0 && (
          <datalist id={`titres-${cle}`}>
            {titresConnus.map((titre) => (
              <option key={titre} value={titre} />
            ))}
          </datalist>
        )}
        {bloc.type !== "choix" && (
        <input
          autoFocus
          value={blocLabel}
          onChange={(e) => setBlocLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && bloc.type !== "choix") poserBloc();
            if (e.key === "Escape") setBloc(null);
          }}
          placeholder="Intitulé de la ligne…"
          style={champ}
        />
        )}
        {bloc.type === "choix" && (
          // A line each, not slashes: the answers are written as they will be
          // read, and Enter goes to the next one rather than ending the block.
          <textarea
            value={blocReponses}
            onChange={(e) => setBlocReponses(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBloc(null);
            }}
            rows={Math.max(3, blocReponses.split("\n").length + 1)}
            placeholder={"Une réponse par ligne\nTendance\nRange"}
            style={{ ...champ, resize: "vertical", lineHeight: 1.5 }}
          />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={poserBloc}
            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: `1px solid ${accentColor}`, background: "transparent", color: accentColor, cursor: "pointer" }}
          >
            Ajouter
          </button>
          <button
            onClick={() => setBloc(null)}
            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid oklch(0.4 0.034 250)", background: "transparent", color: "oklch(0.65 0.034 250)", cursor: "pointer" }}
          >
            Annuler
          </button>
        </div>
      </div>
    );
  };

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
              {editMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <input
                    defaultValue={g.title}
                    onBlur={(e) => renameGroup(g.title, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(0.85 0.017 250)",
                      background: "oklch(0.2 0.034 250)",
                      border: "1px solid oklch(0.35 0.034 250)",
                      borderRadius: 6,
                      padding: "5px 8px",
                    }}
                  />
                  <button
                    onClick={() => removeGroup(g.title, g.items.length)}
                    aria-label="Supprimer le groupe"
                    title="Supprimer ce groupe et tout ce qu'il contient"
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: "1px solid oklch(0.4 0.034 250)",
                      background: "transparent",
                      color: "oklch(0.65 0.034 250)",
                      cursor: "pointer",
                    }}
                  >
                    Supprimer le groupe
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.75 0.034 250)", marginBottom: 10 }}>{g.title}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {g.items.map((item, rang) => {
                  // The heading is drawn from the first line that carries it,
                  // rather than by nesting the list: the row below is a hundred
                  // lines of markup, and wrapping it in another map to gain a
                  // title would have meant rewriting all of it.
                  const categorie = item.category ?? "";
                  const ouvre = categorie !== "" && (rang === 0 || (g.items[rang - 1].category ?? "") !== categorie);
                  const options = answerOptions(item);
                  return (
                  <div key={item.id}>
                  {ouvre &&
                    (editMode ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 2 }}>
                      <input
                        defaultValue={categorie}
                        onBlur={(e) => renameCategorie(g.title, categorie, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: accentColor,
                          background: "oklch(0.2 0.034 250)",
                          border: "1px solid oklch(0.35 0.034 250)",
                          borderRadius: 6,
                          padding: "3px 8px",
                        }}
                      />
                      <button
                        onClick={() => removeCategorie(g.title, categorie, g.items.filter((i) => (i.category ?? "") === categorie).length)}
                        title="Supprimer ce titre et ses lignes"
                        style={{
                          flexShrink: 0,
                          fontSize: 12,
                          padding: "2px 9px",
                          borderRadius: 6,
                          border: "1px solid oklch(0.4 0.034 250)",
                          background: "transparent",
                          color: "oklch(0.65 0.034 250)",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 12,
                          marginBottom: 2,
                          fontSize: 11.5,
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "oklch(0.6 0.034 250)",
                        }}
                      >
                        {categorie}
                      </div>
                    ))}
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
                    {editMode && builder ? (
                      // The label stays text and a pill opens the block form:
                      // a choice line is a label and its answers together, and
                      // an inline field could only ever correct half of it.
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span style={{ fontSize: 14, color: "oklch(0.88 0.017 250)" }}>{item.label}</span>
                        {options.length > 0 && (
                          <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 10, color: "oklch(0.5 0.02 250)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {options.join(" · ")}
                          </span>
                        )}
                        <span
                          onClick={() => {
                            setBloc({ cle: `modifier::${item.id}`, type: options.length > 0 ? "choix" : "case", item });
                            setBlocLabel(item.label);
                            setBlocTitre(options.length > 0 ? item.label : (item.category ?? ""));
                            setBlocReponses(options.join("\n"));
                          }}
                          style={{
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            fontSize: 10,
                            padding: "3px 9px",
                            borderRadius: 999,
                            border: "1px dashed oklch(0.34 0.034 250)",
                            color: "oklch(0.6 0.034 250)",
                            cursor: "pointer",
                            flex: "none",
                          }}
                        >
                          modifier
                        </span>
                      </div>
                    ) : editMode ? (
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
                  {!editMode && item.allowsIdeas && (
                    <TradeIdeas
                      itemId={item.id}
                      market={market}
                      day={todayKey()}
                      ideas={ideas.filter((idea) => idea.itemId === item.id)}
                      vocabulary={vocabulary}
                      onChanged={() => setIdeasVersion((v) => v + 1)}
                    />
                  )}
                  {formulaire(`modifier::${item.id}`)}

                  {/* Not while building with blocks: a line there is written
                      as what it is — a tick box or a choice — so its answers
                      are already set, and a pre-trade list is ticked in the
                      seconds before an entry, which is not when a trade idea
                      gets written. Both stay on the tabs that use them. */}
                  {editMode && !builder && (
                    <div style={{ padding: "0 8px 10px 40px", display: "flex", gap: 8, alignItems: "center" }}>
                      <span
                        onClick={() =>
                          startTransition(async () => {
                            await setChecklistItemAllowsIdeas(item.id, !item.allowsIdeas);
                          })
                        }
                        title="Permettre d'écrire des idées de trade sous cette ligne"
                        style={{
                          flex: "none",
                          fontFamily: "var(--font-jetbrains-mono), monospace",
                          fontSize: 10,
                          padding: "4px 10px",
                          borderRadius: 999,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          border: `1px ${item.allowsIdeas ? "solid" : "dashed"} ${item.allowsIdeas ? accentColor : "oklch(0.34 0.034 250)"}`,
                          background: item.allowsIdeas ? "oklch(0.84 0.17 196 / 0.16)" : "transparent",
                          color: item.allowsIdeas ? accentColor : "oklch(0.55 0.03 250)",
                        }}
                      >
                        idées de trade
                      </span>
                      <input
                        defaultValue={options.join(" / ")}
                        placeholder="Réponses possibles, séparées par « / »"
                        onBlur={(e) => saveOptions(item, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
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
                {/* One button for the section, not one per heading: a block
                    carries its own title now, so a second button that only
                    pre-filled it was the same gesture twice. */}
                {editMode && builder && (
                  <div style={{ paddingLeft: 32, padding: "2px 0 6px 32px" }}>
                    <AjouterBloc
                      types={["case", "choix"]}
                      onChoisir={(type) => {
                        setBloc({ cle: g.title, type });
                        setBlocLabel("");
                        setBlocTitre("");
                        setBlocReponses("");
                      }}
                    />
                    {formulaire(g.title, g.categories.filter(Boolean))}
                  </div>
                )}

                {/* One box per heading, plus the group's own for lines that
                    belong under none: a line has to be typed where it is going,
                    or it lands at the bottom and has to be moved. */}
                {editMode && !builder &&
                  g.categories
                    .filter((categorie) => categorie !== "")
                    .map((categorie) => {
                      const cle = `${g.title}::${categorie}`;
                      const vide = !g.items.some((i) => (i.category ?? "") === categorie);
                      return (
                        <div key={cle} style={{ padding: "4px 8px 10px", marginLeft: 32 }}>
                          {vide && (
                            <div
                              style={{
                                fontSize: 11.5,
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: accentColor,
                                marginBottom: 6,
                              }}
                            >
                              {categorie}
                            </div>
                          )}
                          <input
                            placeholder={`Ajouter dans « ${categorie} »…`}
                            value={newItemDrafts[cle] ?? ""}
                            onChange={(e) => setNewItemDrafts((d) => ({ ...d, [cle]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addItem(cle);
                            }}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              fontSize: 13.5,
                              color: "oklch(0.88 0.017 250)",
                              background: "transparent",
                              border: "1px dashed oklch(0.4 0.034 250)",
                              borderRadius: 6,
                              padding: "4px 8px",
                            }}
                          />
                        </div>
                      );
                    })}


                {editMode && !builder && (
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

          {/* No new sections while building with blocks: this tab has the two
              strategies and no reason to grow a third. */}
          {editMode && !builder && (
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
