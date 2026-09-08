"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { ALL_CURRENCIES, DEFAULT_CURRENCIES, type EconomicEvent } from "@/lib/economicCalendar";
import { setEventRating } from "@/lib/actions/eventRatings";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

type Range = "yesterday" | "today" | "tomorrow" | "week" | "nextweek";
type Impact = EconomicEvent["impact"];

const RANGES: { id: Range; label: string }[] = [
  { id: "yesterday", label: "Hier" },
  { id: "today", label: "Aujourd'hui" },
  { id: "tomorrow", label: "Demain" },
  { id: "week", label: "Cette semaine" },
  { id: "nextweek", label: "Semaine prochaine" },
];

const IMPACTS: { id: Impact; label: string }[] = [
  { id: "high", label: "Fort" },
  { id: "medium", label: "Moyen" },
  { id: "low", label: "Faible" },
];

/** Local YYYY-MM-DD, which is how every day in here is named and compared. */
const ymd = (d: Date) => d.toLocaleDateString("en-CA");

function dayShifted(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/** Monday of the week `weeks` away, and the Sunday that closes it. */
function weekBounds(weeks: number): [string, string] {
  const start = new Date();
  // getDay() calls Sunday 0; the trading week starts on Monday.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return [ymd(start), ymd(end)];
}

/** The inclusive span of days a filter covers. */
function rangeBounds(range: Range): [string, string] {
  switch (range) {
    case "yesterday":
      return [dayShifted(-1), dayShifted(-1)];
    case "tomorrow":
      return [dayShifted(1), dayShifted(1)];
    case "week":
      return weekBounds(0);
    case "nextweek":
      return weekBounds(1);
    default:
      return [dayShifted(0), dayShifted(0)];
  }
}

/** Local YYYY-MM-DD for an instant, in the reader's own timezone. */
function localDay(event: EconomicEvent) {
  return event.at ? new Date(event.at).toLocaleDateString("en-CA") : event.date;
}

function localTime(event: EconomicEvent) {
  return event.at
    ? new Date(event.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;
}

function dayLabel(day: string) {
  if (day === dayShifted(0)) return "Aujourd'hui";
  if (day === dayShifted(-1)) return "Hier";
  if (day === dayShifted(1)) return "Demain";
  // Midday, so a timezone shift cannot move the date across midnight.
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * A filter chip.
 *
 * Lit when it is on, because a filter the reader cannot see the state of is
 * worse than no filter: the card would just look empty for no stated reason.
 */
function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 10.5,
        padding: "3px 9px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${on ? accentColor : "oklch(0.32 0.02 250)"}`,
        background: on ? "oklch(0.72 0.14 195 / 0.14)" : "transparent",
        color: on ? accentColor : "oklch(0.6 0.02 250)",
        transition: "color 120ms, border-color 120ms, background 120ms",
      }}
    >
      {label}
    </button>
  );
}

const STORE = "flux.calendar.filters";

type Filters = { range: Range; currencies: string[]; impacts: Impact[] };

const DEFAULTS: Filters = { range: "today", currencies: DEFAULT_CURRENCIES, impacts: ["high", "medium"] };

/**
 * The saved filters, as an external store rather than state seeded in an effect.
 *
 * Storage is read once and cached: `useSyncExternalStore` needs the same string
 * back every time it asks, or it re-renders forever. It also lets the server
 * render the defaults and the browser swap in what was saved without the two
 * disagreeing over the markup.
 */
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function getSnapshot(): string | null {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(STORE);
    } catch {
      // A private window, or storage turned off: the defaults are fine.
      cached = null;
    }
  }
  return cached;
}

/** The server has nothing saved, so it draws the defaults. */
const getServerSnapshot = (): string | null => null;

function saveFilters(filters: Filters) {
  const raw = JSON.stringify(filters);
  cached = raw;
  try {
    localStorage.setItem(STORE, raw);
  } catch {
    // Not worth telling anyone about — the filters still work this session.
  }
  for (const listener of listeners) listener();
}

function parseFilters(raw: string | null): Filters {
  if (!raw) return DEFAULTS;
  try {
    const saved = JSON.parse(raw);
    return {
      range: RANGES.some((r) => r.id === saved?.range) ? saved.range : DEFAULTS.range,
      currencies: Array.isArray(saved?.currencies) ? saved.currencies : DEFAULTS.currencies,
      impacts: Array.isArray(saved?.impacts) ? saved.impacts : DEFAULTS.impacts,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * The week's releases, drawn by the journal itself.
 *
 * It used to be an investing.com iframe, which showed a white page inside a
 * dark app on a good day and nothing at all on a normal one: that widget
 * refuses to be framed. The feed behind this one is plain XML, so the rows can
 * be drawn like everything else here — and the times can be moved to the
 * reader's clock rather than left in whatever zone the widget assumed.
 *
 * The filters are the ones that widget had — a span of days, the currencies,
 * how much a release matters — kept in the browser so the card opens where it
 * was left rather than back on the defaults every morning.
 */
export default function EconomicCalendar({ events, ok, source }: { events: EconomicEvent[]; ok: boolean; source: string }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { range, currencies, impacts } = useMemo(() => parseFilters(raw), [raw]);

  /**
   * Ratings changed since the page was drawn.
   *
   * The write goes to the database, but the page around it holds a copy of the
   * events from the server and will not re-read them: without this the row
   * would keep its old bars until a reload, and the click would look ignored.
   */
  const [rerated, setRerated] = useState<Record<string, Impact>>({});

  const cycle = (event: EconomicEvent) => {
    const key = `${event.currency}|${event.title}`;
    const next = NEXT_LEVEL[rerated[key] ?? event.impact];
    setRerated((cur) => ({ ...cur, [key]: next }));
    void setEventRating(event.currency, event.title, next);
  };

  const setRange = (next: Range) => saveFilters({ range: next, currencies, impacts });
  const setCurrencies = (next: string[]) => saveFilters({ range, currencies: next, impacts });
  const setImpacts = (next: Impact[]) => saveFilters({ range, currencies, impacts: next });

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const grouped = useMemo(() => {
    const [from, to] = rangeBounds(range);
    const byDay = new Map<string, EconomicEvent[]>();
    for (const event of events) {
      // A closed market is shown whatever the importance filter says: it is
      // the one row that explains a whole day of nothing.
      //
      // So is a row rated in this session, even down to a level the filter
      // hides: one click on a three-star release rates it one star, and a row
      // that vanishes on the click that lowered it cannot be clicked back.
      const key = `${event.currency}|${event.title}`;
      const impact = rerated[key] ?? event.impact;
      if (event.kind !== "holiday" && rerated[key] === undefined && !impacts.includes(impact)) continue;
      if (!currencies.includes(event.currency)) continue;
      const day = localDay(event);
      if (day < from || day > to) continue;
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(impact === event.impact ? event : { ...event, impact });
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events, range, currencies, impacts, rerated]);

  const shown = grouped.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <div style={{ ...glassCard, padding: 0, maxWidth: 620, marginInline: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px 12px" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Calendrier économique</div>
        <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.034 250)", marginLeft: "auto" }}>{source}</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "0 18px 14px",
          borderBottom: "1px solid oklch(0.3 0.034 250 / 0.6)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {RANGES.map((r) => (
            <Chip key={r.id} label={r.label} on={range === r.id} onClick={() => setRange(r.id)} />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {ALL_CURRENCIES.map((c) => (
            <Chip
              key={c}
              label={c}
              on={currencies.includes(c)}
              onClick={() => setCurrencies(toggle(currencies, c))}
            />
          ))}
          <span style={{ width: 1, height: 14, background: "oklch(0.32 0.02 250)", margin: "0 3px" }} />
          {IMPACTS.map((i) => (
            <Chip
              key={i.id}
              label={i.label}
              on={impacts.includes(i.id)}
              onClick={() => setImpacts(toggle(impacts, i.id))}
            />
          ))}
        </div>
      </div>

      {!ok && (
        <div style={{ padding: "16px 18px", fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
          Le flux n&apos;a pas répondu — il limite les appels rapprochés. Il sera relu dans l&apos;heure.
        </div>
      )}
      {ok && shown === 0 && (
        <div style={{ padding: "16px 18px", fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
          Aucune publication ne passe ces filtres.
        </div>
      )}

      {grouped.map(([day, rows]) => (
        <div key={day}>
          <div
            style={{
              ...mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: day === dayShifted(0) ? accentColor : "oklch(0.5 0.03 250)",
              padding: "10px 18px 6px",
              borderBottom: "1px solid oklch(0.28 0.03 250 / 0.5)",
            }}
          >
            {dayLabel(day)}
          </div>
          {rows.map((event, i) => (
            <div
              key={`${event.title}-${event.at ?? i}`}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "8px 18px",
                borderBottom: "1px solid oklch(0.26 0.03 250 / 0.35)",
              }}
            >
              <span style={{ ...mono, fontSize: 11.5, color: "oklch(0.72 0.02 250)", flex: "none", width: 56 }}>
                {event.kind === "holiday" ? "journée" : (localTime(event) ?? "—")}
              </span>
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  flex: "none",
                  padding: "1px 7px",
                  borderRadius: 999,
                  border: "1px solid oklch(0.34 0.02 250)",
                  color: "oklch(0.7 0.02 250)",
                }}
              >
                {event.currency}
              </span>
              {event.kind === "holiday" ? (
                <span
                  style={{
                    ...mono,
                    fontSize: 9.5,
                    flex: "none",
                    padding: "1px 6px",
                    borderRadius: 999,
                    letterSpacing: "0.08em",
                    border: `1px solid ${lossColor}`,
                    color: lossColor,
                  }}
                >
                  FÉRIÉ
                </span>
              ) : (
                <Impact level={event.impact} onCycle={() => cycle(event)} />
              )}
              <span style={{ fontSize: 12.5, color: "oklch(0.85 0.017 250)", flex: 1, minWidth: 0 }}>{event.title}</span>
              {(event.actual || event.forecast || event.previous) && (
                <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.55 0.02 250)", flex: "none", whiteSpace: "nowrap" }}>
                  {/* The published figure, once it exists, is the only number
                      on the row worth reading first — so it is the lit one. */}
                  {event.actual && (
                    <span style={{ color: accentColor, marginRight: 4 }}>{event.actual}</span>
                  )}
                  {event.forecast || "—"} <span style={{ opacity: 0.5 }}>/ {event.previous || "—"}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ ...mono, fontSize: 9.5, color: "oklch(0.45 0.02 250)", padding: "8px 18px" }}>
        publié · prévision / précédent · heures locales · clic sur les étoiles pour renoter
      </div>
    </div>
  );
}

const NEXT_LEVEL: Record<Impact, Impact> = { low: "medium", medium: "high", high: "low" };

const LEVEL_NAME: Record<Impact, string> = { low: "faible", medium: "moyenne", high: "forte" };

/**
 * Three stars, lit as far as the release matters — and a click away from being
 * rated differently.
 *
 * Stars rather than the bars this used to draw, so a row can be held against
 * investing.com's own column and read at a glance: two scales in the same
 * shape compare, two shapes do not.
 *
 * The rating is the part of a calendar most often wrong: the source rates the
 * indicator, not what it does to the tape. Rather than argue with it in code
 * every time, a click cycles this row's rating and keeps it for that release,
 * every month, in the database.
 */
function Impact({ level, onCycle }: { level: Impact; onCycle?: () => void }) {
  const lit = level === "high" ? 3 : level === "medium" ? 2 : 1;
  // A single star is still a lit star: leaving it the colour of an unlit one
  // made a rated row look unrated.
  const colour = level === "high" ? lossColor : level === "medium" ? accentColor : "oklch(0.78 0.02 250)";
  return (
    <button
      type="button"
      onClick={onCycle}
      disabled={!onCycle}
      title={onCycle ? `Importance ${LEVEL_NAME[level]} — cliquer pour la changer` : undefined}
      style={{
        display: "inline-flex",
        gap: 1.5,
        alignItems: "center",
        flex: "none",
        padding: "2px 3px",
        margin: "0 -3px",
        border: "none",
        borderRadius: 3,
        background: "transparent",
        cursor: onCycle ? "pointer" : "default",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            fontSize: 12,
            lineHeight: 1,
            color: i < lit ? colour : "oklch(0.32 0.02 250)",
            textShadow: i < lit ? `0 0 7px ${colour}` : "none",
          }}
        >
          ★
        </span>
      ))}
    </button>
  );
}
