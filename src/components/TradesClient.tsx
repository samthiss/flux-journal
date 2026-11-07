"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accentColor, accentSoft, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import { PageTitle } from "@/components/NeonText";
import PeriodFilter from "@/components/PeriodFilter";
import { filterByPeriod, withOutcome, type TradeForStats as Trade } from "@/lib/stats";
import { tagTone } from "@/lib/tags";
import { enregistrerVue } from "@/lib/actions/vue";
import { deleteTrades } from "@/lib/actions/trades";

/**
 * The annotation columns, after the figures.
 *
 * One vocabulary per column, as Size, P&L and R:R are one number per column:
 * a word means something different under each of these headings, and a single
 * column of everything hid which was which.
 */
const COLONNES: { cle: string; titre: string; largeur: string }[] = [
  { cle: "emotion", titre: "Emotion", largeur: "90px" },
  { cle: "type", titre: "Type", largeur: "110px" },
  { cle: "zone", titre: "Zone", largeur: "140px" },
  { cle: "cc", titre: "Conf. CC", largeur: "150px" },
  { cle: "box", titre: "Conf. Box cluster", largeur: "150px" },
  { cle: "reverse", titre: "Conf. Reverse chart", largeur: "150px" },
  { cle: "risk", titre: "Risk management", largeur: "150px" },
  { cle: "plan", titre: "Plan", largeur: "60px" },
];

/**
 * What was written after the trade, shown beside it where the journal is
 * shared.
 *
 * It is the one column that is prose rather than a word, and the one a reader
 * who was not there needs: the figures say what happened, this says why. Kept
 * out of the owner's own table, where it would be read on the trade's page.
 */
const COLONNE_POST: (typeof COLONNES)[number] = { cle: "post", titre: "Post trade analysis", largeur: "300px" };

/**
 * What has been said back, beside what was said.
 *
 * In the list as well as on the trade's page, because a remark nobody notices
 * is a remark that was not made: a reader scrolling the table can see which
 * trades have been talked about without opening each one. Writing still
 * happens on the trade's page — a row is a link, and a text box inside a link
 * is a fight between the two.
 */
const COLONNE_COMMENTAIRES: (typeof COLONNES)[number] = { cle: "comments", titre: "Comments", largeur: "260px" };

/**
 * What the table does not show any more.
 *
 * The vocabularies are still written on a trade and still read on its own
 * page; it is the list they left. Seven columns of words beside the figures
 * made a table to be scrolled sideways rather than read, and the one of them
 * that is looked at while scanning is the emotion.
 */
const CACHEES = new Set(["type", "zone", "cc", "box", "reverse", "risk", "plan"]);

/**
 * The columns whose words are not already asked about in the bar.
 *
 * Type, zone and the CC list have had a filter there since before they had a
 * column; these four are the ones that had none.
 */
const FILTRES_EN_PLUS: Record<string, string> = {
  emotion: "All emotions",
  box: "All box cluster conf.",
  reverse: "All reverse chart conf.",
  plan: "All plans",
};

/** Every word one column holds, for its own dropdown. */
function motsDeColonne(cle: string, trades: { id: string }[], details: Record<string, Record<string, string[]>>) {
  const vus = new Set<string>();
  for (const t of trades) for (const mot of details[t.id]?.[cle] ?? []) vus.add(mot);
  return [...vus].sort((a, b) => a.localeCompare(b));
}

/** Whether a trade answers every column filter that is set. */
function passeLesColonnes(
  id: string,
  colonnes: typeof COLONNES,
  filtres: Record<string, string>,
  details: Record<string, Record<string, string[]>>
) {
  return colonnes.every((c) => !filtres[c.cle] || (details[id]?.[c.cle] ?? []).includes(filtres[c.cle]));
}

/** The figures, then one column per vocabulary. */
/**
 * The figures, then one column per vocabulary.
 *
 * Through a share link the table is shorter: the setup goes, and of the
 * annotations only the emotion is kept. What is left is what a trade was and
 * how it went — the rest is working notes, which is not what a link is sent
 * for.
 */
function grilleEt(colonnes: typeof COLONNES, avecSetup: boolean, avecCases: boolean) {
  const figures = avecSetup ? "100px 90px 70px 120px 70px 110px 90px 90px" : "100px 90px 70px 70px 110px 90px 90px";
  return `${avecCases ? "30px " : ""}${figures} ${colonnes.map((c) => c.largeur).join(" ")}`;
}

const selectStyle: React.CSSProperties = {
  background: "oklch(0.18 0.034 250)",
  border: "1px solid oklch(0.32 0.051 250 / 0.6)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "oklch(0.96 0.0068 250)",
  fontFamily: "var(--font-space-grotesk), sans-serif",
  fontSize: 13,
};

const OPEN_NEW_TAB_KEY = "trades-open-new-tab";

/**
 * A tick box, drawn rather than native.
 *
 * A browser checkbox would arrive with its own blue and its own size in the
 * middle of a table that sets both; the dash is for the heading when some but
 * not all of the rows are ticked.
 */
function Case({ cochee, partielle = false }: { cochee: boolean; partielle?: boolean }) {
  const actif = cochee || partielle;
  return (
    <span
      style={{
        display: "block",
        width: 14,
        height: 14,
        borderRadius: 4,
        border: `1px solid ${actif ? accentColor : "oklch(0.42 0.04 250)"}`,
        background: actif ? accentColor : "transparent",
        position: "relative",
      }}
    >
      {cochee && (
        <span
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 4,
            height: 8,
            border: "solid oklch(0.15 0.034 250)",
            borderWidth: "0 1.6px 1.6px 0",
            transform: "rotate(45deg)",
          }}
        />
      )}
      {partielle && !cochee && (
        <span
          style={{
            position: "absolute",
            left: 2.5,
            top: 5.5,
            width: 7,
            height: 1.6,
            background: "oklch(0.15 0.034 250)",
          }}
        />
      )}
    </span>
  );
}

export default function TradesClient({
  trades,
  initialPeriod,
  details = {},
  proprietaire = true,
  lectureSeule = false,
  lienBase,
  vue = {},
  enregistre = false,
}: {
  proprietaire?: boolean;
  /**
   * Shown through a share link.
   *
   * The rows still open their trade — that is what a journal is read for —
   * but under the link's own address, since the journal's own is behind the
   * password. The switch that chose how a row opened goes: through a link
   * there is one way in.
   */
  lectureSeule?: boolean;
  /** Where a row leads, when it is not the journal's own trade page. */
  lienBase?: string;
  /**
   * The list as the owner last left it.
   *
   * The owner's own choices are written down and handed to everyone the
   * journal is shared with, so a link opens on the same view it was sent
   * from. Here they are only the starting point: a reader is free to narrow
   * it further, and nothing they do is saved.
   */
  vue?: Record<string, string>;
  /** Whether choosing a filter here records it for everyone else. */
  enregistre?: boolean;
  details?: Record<string, Record<string, string[]>>;
  trades: Trade[];
  initialPeriod: string;
}) {
  /**
   * Shown through a link: the emotion, then what was written afterwards and
   * what has been said back. On the owner's own page: whatever is not hidden.
   */
  const colonnes = useMemo(
    () =>
      lectureSeule
        ? [...COLONNES.filter((c) => c.cle === "emotion"), COLONNE_POST, COLONNE_COMMENTAIRES]
        : [...COLONNES.filter((c) => !CACHEES.has(c.cle)), COLONNE_COMMENTAIRES],
    [lectureSeule]
  );

  const [filterSymbol, setFilterSymbol] = useState(vue.symbol ?? "all");
  const [filterOutcome, setFilterOutcome] = useState(vue.outcome ?? "all");
  const [filterSetup, setFilterSetup] = useState(vue.setup ?? "all");
  const [filterStrategy, setFilterStrategy] = useState(vue.strategy ?? "all");
  const [filterTp, setFilterTp] = useState(vue.tp ?? "all");
  const [filterValidity, setFilterValidity] = useState(vue.validity ?? "all");
  const [openInNewTab, setOpenInNewTab] = useState(false);

  /**
   * The rows ticked, for deleting a batch of them.
   *
   * A journal is corrected in batches — a bad import, a morning entered twice
   * — and one trade at a time is a page load and a confirmation per row.
   */
  const [coches, setCoches] = useState<Set<string>>(new Set());
  // Where the last tick was, so shift-clicking takes everything between.
  const [dernier, setDernier] = useState<number | null>(null);
  // Two presses rather than a dialog: Chrome lets a page stop showing them,
  // and a blocked confirm() reads as a delete button that does nothing.
  const [confirme, setConfirme] = useState(false);
  const [suppression, enSuppression] = useTransition();
  const router = useRouter();

  // The same period as the dashboard and the report, through the same cookie:
  // three pages reading one journal should not disagree about which weeks are
  // being counted.
  const [period, setPeriod] = useState(vue.period ?? initialPeriod);
  /**
   * One filter per annotation column, chosen in its own heading.
   *
   * Under the column it filters rather than in the bar above: seven more
   * dropdowns up there would be a wall, and a filter placed on the column
   * says what it filters without being labelled twice.
   */
  const [filtresColonnes, setFiltresColonnes] = useState<Record<string, string>>(() =>
    // Only the columns on the page: a saved filter on a column that has since
    // been hidden would go on narrowing the list with nothing to say so.
    Object.fromEntries(
      colonnes.map((c) => [c.cle, vue[`col.${c.cle}`] ?? ""]).filter(([, valeur]) => valeur)
    )
  );

  /**
   * Writes the view down, for whoever the journal is shared with.
   *
   * Only from the owner's own page, and fire-and-forget: a filter that paints
   * instantly and is recorded a moment later is right, and one that waits for
   * the network to answer before moving is not.
   */
  const noter = (modif: Record<string, string>) => {
    if (!enregistre) return;
    void enregistrerVue({
      symbol: filterSymbol,
      outcome: filterOutcome,
      setup: filterSetup,
      strategy: filterStrategy,
      tp: filterTp,
      validity: filterValidity,
      period,
      ...Object.fromEntries(colonnes.map((c) => [`col.${c.cle}`, filtresColonnes[c.cle] ?? ""])),
      ...modif,
    });
  };

  const GRILLE = grilleEt(colonnes, !lectureSeule, !lectureSeule);

  const choosePeriod = (next: string) => {
    setPeriod(next);
    noter({ period: next });
    try {
      document.cookie = `dash-period=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    } catch {}
  };
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the preference from localStorage after mount
    setOpenInNewTab(localStorage.getItem(OPEN_NEW_TAB_KEY) === "1");
  }, []);

  const changeOpenInNewTab = (next: boolean) => {
    setOpenInNewTab(next);
    localStorage.setItem(OPEN_NEW_TAB_KEY, next ? "1" : "0");
  };

  const symbolOptions = useMemo(() => [...new Set(trades.map((t) => t.symbol))], [trades]);
  const setupOptions = useMemo(() => [...new Set(trades.map((t) => t.setup))], [trades]);
  /**
   * The schools actually written on a trade.
   *
   * Derived rather than fixed, like the setups above: the field was added
   * after the journal had 88 trades in it, and a menu offering a school none
   * of them names is a filter that empties the table. "No strategy" earns its
   * place for as long as some of them are the ones taken before the question
   * was asked.
   */
  const strategyOptions = useMemo(
    () => [...new Set(trades.map((t) => t.strategy).filter((s): s is string => Boolean(s)))].sort(),
    [trades],
  );
  const sansStrategie = useMemo(() => trades.some((t) => !t.strategy), [trades]);

  const filteredTrades = useMemo(() => {
    return filterByPeriod(withOutcome(trades), period, now)
      .filter((t) => filterSymbol === "all" || t.symbol === filterSymbol)
      .filter((t) => filterOutcome === "all" || (t.pnl > 0 ? "win" : "loss") === filterOutcome)
      .filter((t) => filterSetup === "all" || t.setup === filterSetup)
      .filter((t) =>
        filterStrategy === "all" ? true : filterStrategy === "none" ? !t.strategy : t.strategy === filterStrategy,
      )
      // "TP2" means the market went at least that far, which is the question
      // worth asking of a setup — not how many stopped exactly there.
      .filter((t) =>
        filterTp === "all"
          ? true
          : filterTp === "none"
            ? t.tpReached == null
            : (t.tpReached ?? 0) >= Number(filterTp),
      )
      // "No verdict" is a filter in its own right: it finds the trades
      // still waiting to be judged, which is the list worth clearing.
      .filter((t) =>
        filterValidity === "all"
          ? true
          : filterValidity === "none"
            ? !t.validity
            : t.validity === filterValidity,
      )
      .slice()
      .reverse();
  }, [trades, period, now, filterSymbol, filterOutcome, filterSetup, filterStrategy, filterTp, filterValidity]);

  /**
   * The rows actually on the page.
   *
   * Named once because three things read it: the count in the header, the rows
   * themselves, and the tick-all box — which must tick what is on screen and
   * nothing a filter is hiding.
   */
  const visibles = useMemo(
    () => filteredTrades.filter((t) => passeLesColonnes(t.id, colonnes, filtresColonnes, details)),
    [filteredTrades, colonnes, filtresColonnes, details]
  );

  /** The ticks a filter has since hidden do not count, and are not deleted. */
  const selection = useMemo(() => visibles.filter((t) => coches.has(t.id)).map((t) => t.id), [visibles, coches]);
  const toutCoche = visibles.length > 0 && selection.length === visibles.length;

  /**
   * Ticking one row, a range of them, or all of them.
   *
   * Shift takes everything between this row and the last one ticked, which is
   * how a table behaves everywhere else and the difference between correcting
   * an import in one gesture and in forty.
   */
  const cocher = (index: number, etendre: boolean) => {
    setConfirme(false);
    setCoches((avant) => {
      const apres = new Set(avant);
      const id = visibles[index].id;
      if (etendre && dernier !== null) {
        const [de, a] = dernier < index ? [dernier, index] : [index, dernier];
        // The row shift-clicked decides: ticking if it was unticked, clearing
        // the span otherwise.
        const ajoute = !avant.has(id);
        for (let n = de; n <= a; n++) {
          if (ajoute) apres.add(visibles[n].id);
          else apres.delete(visibles[n].id);
        }
      } else if (apres.has(id)) {
        apres.delete(id);
      } else {
        apres.add(id);
      }
      return apres;
    });
    setDernier(index);
  };

  const cocherTout = () => {
    setConfirme(false);
    setDernier(null);
    setCoches(toutCoche ? new Set() : new Set(visibles.map((t) => t.id)));
  };

  const supprimerLaSelection = () => {
    if (!selection.length || suppression) return;
    if (!confirme) {
      setConfirme(true);
      return;
    }
    const partent = selection;
    enSuppression(async () => {
      await deleteTrades(partent);
      setCoches(new Set());
      setDernier(null);
      setConfirme(false);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="trades-header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <PageTitle>Trades</PageTitle>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>{visibles.length} trades</div>
        </div>
        {/* Not offered to a shared account, which may read these rows and
            write none of them. */}
        {proprietaire && (
          <Link
            href="/trade/new"
            style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 9, background: accentColor, color: "oklch(0.12 0.017 250)", textDecoration: "none" }}
          >
            + Add Trade
          </Link>
        )}
      </div>

      <div className="trades-filters" style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <select value={filterSymbol} onChange={(e) => { setFilterSymbol(e.target.value); noter({ symbol: e.target.value }); }} style={selectStyle}>
          <option value="all">All symbols</option>
          {symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filterOutcome} onChange={(e) => { setFilterOutcome(e.target.value); noter({ outcome: e.target.value }); }} style={selectStyle}>
          <option value="all">All outcomes</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
        </select>
        {/* The filters for the columns a share link does not show. A menu
            that narrows a column nobody is looking at is a question about
            something that is not on the page. */}
        {!lectureSeule && (
          <>
        <select value={filterSetup} onChange={(e) => { setFilterSetup(e.target.value); noter({ setup: e.target.value }); }} style={selectStyle}>
          <option value="all">All setups</option>
          {setupOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterStrategy}
          onChange={(e) => { setFilterStrategy(e.target.value); noter({ strategy: e.target.value }); }}
          disabled={strategyOptions.length === 0}
          style={{ ...selectStyle, opacity: strategyOptions.length === 0 ? 0.45 : 1 }}
        >
          <option value="all">All strategies</option>
          {strategyOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {sansStrategie && strategyOptions.length > 0 && <option value="none">No strategy</option>}
        </select>
        <select value={filterTp} onChange={(e) => { setFilterTp(e.target.value); noter({ tp: e.target.value }); }} style={selectStyle}>
          <option value="all">All TP</option>
          <option value="1">TP1+</option>
          <option value="2">TP2+</option>
          <option value="3">TP3</option>
          <option value="none">No TP</option>
        </select>
        {/* The verdict: whether a trade should have been taken at all. A
            winner on a forbidden setup is findable here and nowhere else. */}
        <select value={filterValidity} onChange={(e) => { setFilterValidity(e.target.value); noter({ validity: e.target.value }); }} style={selectStyle}>
          <option value="all">All verdicts</option>
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
          <option value="risk">Risk</option>
          <option value="none">No verdict</option>
        </select>
          </>
        )}
        {/* The annotation columns that had no filter yet, in the bar with the
            rest rather than under their own headings: a filter is looked for
            in one place, and this is where the others are. */}
        {colonnes.filter((c) => FILTRES_EN_PLUS[c.cle]).map((c) => {
          const mots = motsDeColonne(c.cle, trades, details);
          return (
            <select
              key={c.cle}
              value={filtresColonnes[c.cle] ?? ""}
              onChange={(e) => {
                setFiltresColonnes((prev) => ({ ...prev, [c.cle]: e.target.value }));
                noter({ [`col.${c.cle}`]: e.target.value });
              }}
              disabled={mots.length === 0}
              style={{ ...selectStyle, opacity: mots.length === 0 ? 0.45 : 1 }}
            >
              <option value="">{FILTRES_EN_PLUS[c.cle]}</option>
              {mots.map((mot) => (
                <option key={mot} value={mot}>
                  {mot}
                </option>
              ))}
            </select>
          );
        })}
        <PeriodFilter period={period} onChange={choosePeriod} />
        {/* A two-state preference reads better as a switch than as a list of
            two sentences that both start with the same word. Gone where the
            rows open nothing. */}
        {!lectureSeule && (
        <button
          type="button"
          onClick={() => changeOpenInNewTab(!openInNewTab)}
          style={{
            ...selectStyle,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 9,
            border: `1px solid ${openInNewTab ? "oklch(0.84 0.17 196 / 0.5)" : "oklch(0.32 0.051 250 / 0.6)"}`,
            background: openInNewTab ? "oklch(0.84 0.17 196 / 0.12)" : "oklch(0.18 0.034 250)",
            color: openInNewTab ? accentColor : "oklch(0.7 0.03 250)",
          }}
        >
          <span
            style={{
              width: 28,
              height: 16,
              borderRadius: 999,
              flex: "none",
              background: openInNewTab ? accentColor : "oklch(0.3 0.04 250)",
              position: "relative",
              transition: "background 0.15s ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: openInNewTab ? 14 : 2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: openInNewTab ? "oklch(0.12 0.017 250)" : "oklch(0.6 0.03 250)",
                transition: "left 0.15s ease",
              }}
            />
          </span>
          New tab
        </button>
        )}
      </div>

      {/* Only while something is ticked. A delete button standing there with
          nothing selected is a button that spends its life disabled. */}
      {!lectureSeule && selection.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 9,
            border: "1px solid oklch(0.84 0.17 196 / 0.35)",
            background: "oklch(0.84 0.17 196 / 0.08)",
          }}
        >
          <span style={{ fontSize: 13 }}>
            {selection.length} trade{selection.length > 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={supprimerLaSelection}
            disabled={suppression}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${lossColor}`,
              background: confirme ? lossColor : "transparent",
              color: confirme ? "oklch(0.15 0.034 250)" : lossColor,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: suppression ? "default" : "pointer",
              opacity: suppression ? 0.6 : 1,
            }}
          >
            {suppression
              ? "…"
              : confirme
                ? `Delete ${selection.length} — press again`
                : `Delete ${selection.length}`}
          </button>
          <span
            onClick={() => {
              setCoches(new Set());
              setDernier(null);
              setConfirme(false);
            }}
            style={{ fontSize: 12.5, color: "oklch(0.62 0.034 250)", cursor: "pointer" }}
          >
            Clear
          </span>
          {confirme && (
            <span style={{ fontSize: 12, color: "oklch(0.62 0.034 250)" }}>
              This cannot be undone.
            </span>
          )}
        </div>
      )}

      <div className="table-scroll" style={{ ...glassCard, padding: 0 }}>
        {/* Wide enough for the figures and what is left beside them, and no
            wider: the table used to be scrolled sideways past seven columns of
            words. */}
        <div style={{ minWidth: lectureSeule ? 1320 : 1100 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRILLE,
            padding: "14px 20px",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "oklch(0.55 0.034 250)",
            borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)",
          }}
        >
          {/* Ticking the heading takes what is on screen, not what a filter
              is hiding: the box is drawn where the rows' own boxes are. */}
          {!lectureSeule && (
            <div onClick={cocherTout} title={toutCoche ? "Untick every row" : "Tick every row shown"} style={{ cursor: "pointer" }}>
              <Case cochee={toutCoche} partielle={selection.length > 0 && !toutCoche} />
            </div>
          )}
          <div>Date</div>
          <div>Symbol</div>
          <div>Side</div>
          {!lectureSeule && <div>Setup</div>}
          <div>Size</div>
          <div>P&amp;L</div>
          <div>R:R</div>
          <div>Outcome</div>
          {colonnes.map((c) => (
            <div key={c.cle} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.titre}
            </div>
          ))}
        </div>
        {/* The column filters are applied here rather than in the query
            above: each belongs to the heading it sits under. */}
        {visibles.map((t, i) => {
          const outcome = t.pnl > 0 ? "win" : "loss";
          const pnlColor = t.pnl > 0 ? winColor : lossColor;
          const styleLigne = {
                // Capped at fifteen rows: past the first screenful the stagger
                // is only a delay before a row nobody has scrolled to yet, and
                // on 88 trades the last one would wait two seconds.
                animationDelay: `${Math.min(i, 15) * 28}ms`,
                display: "grid",
                gridTemplateColumns: GRILLE,
                padding: "15px 20px",
                fontSize: 13,
                alignItems: "center",
                borderBottom: "1px solid oklch(0.24 0.034 250 / 0.5)",
                textDecoration: "none",
                color: "inherit",
                background: coches.has(t.id) ? "oklch(0.84 0.17 196 / 0.08)" : undefined,
          } as const;
          const cochee = coches.has(t.id);
          const cellules = (
            <>
              {/* Inside the row, which is a link: the click is caught here so
                  ticking a trade does not open it. */}
              {!lectureSeule && (
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cocher(i, e.shiftKey);
                  }}
                  title="Tick this trade — shift-click for a range"
                  style={{ cursor: "pointer" }}
                >
                  <Case cochee={cochee} />
                </div>
              )}
              {/* The hour under the day rather than beside it: a trade is
                  looked up by its date, and the time is what tells two of the
                  same morning apart once it is found. */}
              <div style={{ color: "oklch(0.62 0.034 250)", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12 }}>
                {t.date.toISOString().slice(0, 10)}
                {t.time && (
                  <div style={{ fontSize: 11, color: "oklch(0.5 0.034 250)", marginTop: 2 }}>{t.time}</div>
                )}
              </div>
              <div style={{ fontWeight: 600 }}>{t.symbol}</div>
              <div style={{ color: t.side === "Long" ? accentColor : "oklch(0.6 0.034 250)", fontSize: 12 }}>{t.side}</div>
              {!lectureSeule && <div style={{ fontSize: 12, color: "oklch(0.65 0.017 250)" }}>{t.setup}</div>}
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12, color: "oklch(0.72 0.017 250)" }}>
                {t.size}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontWeight: 600, color: pnlColor }}>
                {fmtMoney(t.pnl)}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 12, color: "oklch(0.6 0.034 250)" }}>
                {t.rr != null ? `1 : ${t.rr.toFixed(1)}` : "—"}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: outcome === "win" ? accentSoft : "oklch(0.72 0.27 340 / 0.16)",
                    color: outcome === "win" ? winColor : lossColor,
                  }}
                >
                  {outcome === "win" ? "Win" : "Loss"}
                </span>
              </div>
              {/* One cell per vocabulary, so a word always sits under the
                  heading that says what it is — as the figures do. */}
              {colonnes.map((c) => {
                const valeur = (details[t.id]?.[c.cle] ?? []).join(", ");
                return (
                  <div
                    key={c.cle}
                    title={valeur || undefined}
                    style={{
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingRight: 10,
                      // Prose is not a tag: the post-trade note keeps the
                      // body colour rather than being tinted by whichever
                      // word it happens to start with.
                      color: !valeur
                        ? "oklch(0.4 0.02 250)"
                        : c.cle === "post" || c.cle === "comments"
                          ? "oklch(0.72 0.017 250)"
                          : tagTone(valeur).fg,
                    }}
                  >
                    {valeur || "—"}
                  </div>
                );
              })}
            </>
          );
          return (
            <Link
              key={t.id}
              className="trade-row"
              href={lienBase ? `${lienBase}/${t.id}` : `/trades/${t.id}`}
              target={!lectureSeule && openInNewTab ? "_blank" : undefined}
              rel={!lectureSeule && openInNewTab ? "noopener noreferrer" : undefined}
              style={styleLigne}
            >
              {cellules}
            </Link>
          );
          })}
        </div>
      </div>
    </div>
  );
}
