"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { accentColor, accentSoft, glassCard, fmtMoney, winColor, lossColor } from "@/lib/theme";
import { PageTitle } from "@/components/NeonText";
import PeriodFilter from "@/components/PeriodFilter";
import { filterByPeriod, withOutcome, type TradeForStats as Trade } from "@/lib/stats";
import { parseTagArray, tagTone } from "@/lib/tags";

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

/** Every word one column holds, for its own dropdown. */
function motsDeColonne(cle: string, trades: { id: string }[], details: Record<string, Record<string, string[]>>) {
  const vus = new Set<string>();
  for (const t of trades) for (const mot of details[t.id]?.[cle] ?? []) vus.add(mot);
  return [...vus].sort((a, b) => a.localeCompare(b));
}

/** Whether a trade answers every column filter that is set. */
function passeLesColonnes(
  id: string,
  filtres: Record<string, string>,
  details: Record<string, Record<string, string[]>>
) {
  return COLONNES.every((c) => !filtres[c.cle] || (details[id]?.[c.cle] ?? []).includes(filtres[c.cle]));
}

/** The figures, then one column per vocabulary. */
const GRILLE = `100px 90px 70px 120px 70px 110px 90px 90px ${COLONNES.map((c) => c.largeur).join(" ")}`;

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

export default function TradesClient({ trades, initialPeriod, details = {} }: { details?: Record<string, Record<string, string[]>>; trades: Trade[]; initialPeriod: string }) {
  const [filterSymbol, setFilterSymbol] = useState("all");
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [filterSetup, setFilterSetup] = useState("all");
  const [filterTp, setFilterTp] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterZone, setFilterZone] = useState("all");
  const [filterConfirmation, setFilterConfirmation] = useState("all");
  const [openInNewTab, setOpenInNewTab] = useState(false);

  // The same period as the dashboard and the report, through the same cookie:
  // three pages reading one journal should not disagree about which weeks are
  // being counted.
  const [period, setPeriod] = useState(initialPeriod);
  /**
   * One filter per annotation column, chosen in its own heading.
   *
   * Under the column it filters rather than in the bar above: seven more
   * dropdowns up there would be a wall, and a filter placed on the column
   * says what it filters without being labelled twice.
   */
  const [filtresColonnes, setFiltresColonnes] = useState<Record<string, string>>({});

  const choosePeriod = (next: string) => {
    setPeriod(next);
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

  // Only the words actually written on a trade: offering a whole vocabulary
  // here would be offering filters that return nothing.
  const typeOptions = useMemo(
    () => [...new Set(trades.flatMap((t) => parseTagArray(t.tradeTypes)))].sort(),
    [trades],
  );
  const zoneOptions = useMemo(
    () => [...new Set(trades.map((t) => t.zone).filter((z): z is string => Boolean(z)))].sort(),
    [trades],
  );
  const confirmationOptions = useMemo(
    () => [...new Set(trades.flatMap((t) => parseTagArray(t.confirmations)))].sort(),
    [trades],
  );
  const filteredTrades = useMemo(() => {
    return filterByPeriod(withOutcome(trades), period, now)
      .filter((t) => filterSymbol === "all" || t.symbol === filterSymbol)
      .filter((t) => filterOutcome === "all" || (t.pnl > 0 ? "win" : "loss") === filterOutcome)
      .filter((t) => filterSetup === "all" || t.setup === filterSetup)
      // "TP2" means the market went at least that far, which is the question
      // worth asking of a setup — not how many stopped exactly there.
      .filter((t) =>
        filterTp === "all"
          ? true
          : filterTp === "none"
            ? t.tpReached == null
            : (t.tpReached ?? 0) >= Number(filterTp),
      )
      .filter((t) => filterType === "all" || parseTagArray(t.tradeTypes).includes(filterType))
      .filter((t) => filterZone === "all" || t.zone === filterZone)
      .filter((t) => filterConfirmation === "all" || parseTagArray(t.confirmations).includes(filterConfirmation))
      .slice()
      .reverse();
  }, [trades, period, now, filterSymbol, filterOutcome, filterSetup, filterTp, filterType, filterZone, filterConfirmation]);

  return (
    <div>
      <div className="trades-header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <PageTitle>Trades</PageTitle>
          <div style={{ fontSize: 14, color: "oklch(0.62 0.034 250)", marginTop: 4 }}>{filteredTrades.filter((t) => passeLesColonnes(t.id, filtresColonnes, details)).length} trades</div>
        </div>
        <Link
          href="/trade/new"
          style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "10px 18px", borderRadius: 9, background: accentColor, color: "oklch(0.12 0.017 250)", textDecoration: "none" }}
        >
          + Add Trade
        </Link>
      </div>

      <div className="trades-filters" style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <select value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} style={selectStyle}>
          <option value="all">All symbols</option>
          {symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)} style={selectStyle}>
          <option value="all">All outcomes</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
        </select>
        <select value={filterSetup} onChange={(e) => setFilterSetup(e.target.value)} style={selectStyle}>
          <option value="all">All setups</option>
          {setupOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filterTp} onChange={(e) => setFilterTp(e.target.value)} style={selectStyle}>
          <option value="all">All TP</option>
          <option value="1">TP1+</option>
          <option value="2">TP2+</option>
          <option value="3">TP3</option>
          <option value="none">No TP</option>
        </select>
        {/* Always drawn, even before anything is tagged. They were hidden
            until a word existed, which made a filter nobody could discover:
            a dropdown holding only "All types" at least says the question can
            be asked, and dims itself to say not yet. */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          disabled={typeOptions.length === 0}
          style={{ ...selectStyle, opacity: typeOptions.length === 0 ? 0.45 : 1 }}
        >
          <option value="all">All types</option>
          {typeOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={filterZone}
          onChange={(e) => setFilterZone(e.target.value)}
          disabled={zoneOptions.length === 0}
          style={{ ...selectStyle, opacity: zoneOptions.length === 0 ? 0.45 : 1 }}
        >
          <option value="all">All zones</option>
          {zoneOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={filterConfirmation}
          onChange={(e) => setFilterConfirmation(e.target.value)}
          disabled={confirmationOptions.length === 0}
          style={{ ...selectStyle, opacity: confirmationOptions.length === 0 ? 0.45 : 1 }}
        >
          <option value="all">All confirmations</option>
          {confirmationOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <PeriodFilter period={period} onChange={choosePeriod} />
        {/* A two-state preference reads better as a switch than as a list of
            two sentences that both start with the same word. */}
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
          Nouvel onglet
        </button>
      </div>

      <div className="table-scroll" style={{ ...glassCard, padding: 0 }}>
        <div style={{ minWidth: 1740 }}>
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
          <div>Date</div>
          <div>Symbol</div>
          <div>Side</div>
          <div>Setup</div>
          <div>Size</div>
          <div>P&amp;L</div>
          <div>R:R</div>
          <div>Outcome</div>
          {COLONNES.map((c) => (
            <div key={c.cle} style={{ paddingRight: 10, minWidth: 0 }}>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.titre}</div>
              {motsDeColonne(c.cle, trades, details).length > 0 && (
                <select
                  value={filtresColonnes[c.cle] ?? ""}
                  onChange={(e) =>
                    setFiltresColonnes((prev) => ({ ...prev, [c.cle]: e.target.value }))
                  }
                  style={{
                    marginTop: 5,
                    width: "100%",
                    maxWidth: "100%",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    fontSize: 10,
                    padding: "3px 4px",
                    borderRadius: 6,
                    border: `1px solid ${filtresColonnes[c.cle] ? accentColor : "oklch(0.3 0.034 250)"}`,
                    background: "oklch(0.18 0.03 250)",
                    color: filtresColonnes[c.cle] ? accentColor : "oklch(0.6 0.02 250)",
                    textTransform: "none",
                    letterSpacing: 0,
                    outline: "none",
                  }}
                >
                  <option value="">tous</option>
                  {motsDeColonne(c.cle, trades, details).map((mot) => (
                    <option key={mot} value={mot}>
                      {mot}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        {/* The column filters are applied here rather than in the query
            above: each belongs to the heading it sits under. */}
        {filteredTrades
          .filter((t) => passeLesColonnes(t.id, filtresColonnes, details))
          .map((t, i) => {
          const outcome = t.pnl > 0 ? "win" : "loss";
          const pnlColor = t.pnl > 0 ? winColor : lossColor;
          return (
            <Link
              key={t.id}
              className="trade-row"
              href={`/trades/${t.id}`}
              target={openInNewTab ? "_blank" : undefined}
              rel={openInNewTab ? "noopener noreferrer" : undefined}
              style={{
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
              }}
            >
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
              <div style={{ fontSize: 12, color: "oklch(0.65 0.017 250)" }}>{t.setup}</div>
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
              {COLONNES.map((c) => {
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
                      color: valeur ? tagTone(valeur).fg : "oklch(0.4 0.02 250)",
                    }}
                  >
                    {valeur || "—"}
                  </div>
                );
              })}
            </Link>
          );
        })}
        </div>
      </div>
    </div>
  );
}
