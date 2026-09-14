"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accentColor, glassCard, lossColor, neonGlow } from "@/lib/theme";
import { DEFAULT_MARKETS, loadMarkets } from "@/lib/markets";
import {
  bandLabel,
  bandStats,
  byHour,
  canAnswer,
  countAt,
  recent,
  sessionLabel,
  sessionStats,
  type AlertHour,
  type Session,
  type Stat,
} from "@/lib/volumeAlerts";
import { saveAlertHour } from "@/lib/actions/volumeAlerts";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

/**
 * The logbook's columns, so the labels sit over what they name.
 *
 * The threshold used to trail the counts as "seuil 200", which read as another
 * figure in the row next to a simulated one. It is a column of its own now,
 * under its own word.
 */
const col = {
  day: { minWidth: 116, flex: 1 } as const,
  count: { width: 46, flex: "none" } as const,
  threshold: { width: 52, flex: "none", textAlign: "right" } as const,
  actions: { width: 62, flex: "none" } as const,
};

/** The simulated count, kept clearly apart from the one that was recorded. */
const simColor = "oklch(0.78 0.16 305)";

/** A release that carries a market, as the page hands it over. */
export type NewsRelease = { at: string; title: string; currency: string };

/** The colour a news hour is marked in: not an error, not a reading. */
const newsColor = "oklch(0.8 0.14 85)";

const SKIP_NEWS_KEY = "volumeAlertSkipNews";

const label = {
  ...mono,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "oklch(0.55 0.03 250)",
  marginBottom: 5,
};

const field = {
  ...mono,
  fontSize: 12.5,
  padding: "6px 9px",
  borderRadius: 4,
  border: "1px solid oklch(0.34 0.03 250)",
  background: "oklch(0.16 0.02 250)",
  color: "oklch(0.88 0.02 250)",
  width: "100%",
  colorScheme: "dark" as const,
};

/**
 * "243 187, 156" — typed however it comes out of the chart.
 *
 * Any separator: a comma, a space, a line break. The one thing that has to be
 * read before splitting is the chart's own thousands separator — it writes
 * 1.036 for a box of 1036, and split naively that becomes a 1 and a 36. A dot
 * followed by exactly three digits is therefore joined back up first, which a
 * comma cannot be: "200,150" is far more likely to be two boxes than one.
 */
function parseValues(raw: string): number[] {
  return raw
    .replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2")
    .split(/[^\d]+/)
    .map((piece) => Number(piece))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * A number field that can be emptied on the way to another number.
 *
 * Parsing on every keystroke and writing the result straight back means an
 * empty field reads as zero and is refilled with "0" under the cursor, so the
 * only way to change 150 into 200 is to select it first. The text typed is
 * held here instead, and only committed when it parses — an empty field
 * commits nothing and keeps the last value, then tidies itself on blur.
 */
function NumberField({
  value,
  onChange,
  min,
  max,
  width,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  width: number | string;
}) {
  const [draft, setDraft] = useState(String(value));

  // The text is held here, so a value set from outside — read back from the
  // browser on load, or dropped in by "corriger" — has to be brought in, or the
  // field keeps showing what it was first rendered with. Adjusted during the
  // render that brings the new value, and a draft already parsing to it is the
  // one being typed, so it is left alone.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (Number(draft) !== value) setDraft(String(value));
  }

  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === "") return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, Math.round(parsed))));
      }}
      onBlur={() => setDraft(String(value))}
      style={{ ...field, width, padding: "3px 7px", fontSize: 11.5 }}
    />
  );
}

const today = () => new Date().toLocaleDateString("en-CA");

/** The stretch a reading is made over, until one is chosen. */
const DEFAULT_SESSION: Session = { start: 2, end: 7 };

const SESSION_KEY = "volumeAlertSession";
/** The list this replaced, read once so a stretch already set is not lost. */
const SESSIONS_KEY = "volumeAlertSessions";

const isHour = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 24;

function loadSession(): Session {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isHour(parsed?.start) && isHour(parsed?.end)) return { start: parsed.start, end: parsed.end };
    }
    const legacy = window.localStorage.getItem(SESSIONS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const first = Array.isArray(parsed) ? parsed[0] : null;
      if (isHour(first?.start) && isHour(first?.end)) return { start: first.start, end: first.end };
    }
  } catch {
    // ignore storage failures
  }
  return DEFAULT_SESSION;
}

function saveSession(session: Session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage failures
  }
}

/**
 * The threshold the logbook is replayed at, alongside the one in force.
 *
 * Zero is off. What it answers is the only question the recorded boxes can
 * answer exactly: at 250, this hour would have shown two alerts instead of
 * five. It reaches upward only — an hour watched at 200 never wrote down what
 * happened between 150 and 200, so a simulation under 200 would be inventing
 * the quiet, and such an hour says nothing rather than zero.
 */
const SIM_KEY = "volumeAlertSim";

function loadSim(): number {
  try {
    const raw = window.localStorage.getItem(SIM_KEY);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveSim(sim: number) {
  try {
    window.localStorage.setItem(SIM_KEY, String(sim));
  } catch {
    // ignore storage failures
  }
}

/**
 * The band of alerts per hour a setting is judged against.
 *
 * Kept per browser like the sessions: how many alerts an hour is tolerable is
 * a habit of whoever watches them, not something the journal records.
 */
const LIMITS_KEY = "volumeAlertLimits";

type Limits = { floor: number; ceiling: number };

const DEFAULT_LIMITS: Limits = { floor: 0, ceiling: 5 };

function loadLimits(): Limits {
  try {
    const raw = window.localStorage.getItem(LIMITS_KEY);
    if (!raw) return DEFAULT_LIMITS;
    const parsed = JSON.parse(raw);
    const floor = parsed?.floor;
    const ceiling = parsed?.ceiling;
    if (!Number.isInteger(floor) || floor < 0 || floor > 99) return DEFAULT_LIMITS;
    if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 99) return DEFAULT_LIMITS;
    return { floor, ceiling };
  } catch {
    return DEFAULT_LIMITS;
  }
}

function saveLimits(limits: Limits) {
  try {
    window.localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
  } catch {
    // ignore storage failures
  }
}

/**
 * The hour being filled in: market, day, hour, threshold.
 *
 * Kept per browser so a refresh comes back to the same hour. Filling the
 * logbook is done in runs — the same market, the same morning, one band after
 * another — and a form that resets to today at 7h on 6B every time makes the
 * second entry of a run harder than the first.
 */
const ENTRY_KEY = "volumeAlertEntry";

type Entry = { market: string; day: string; hour: number; threshold: number };

const DEFAULT_ENTRY: Entry = { market: "6B", day: "", hour: 7, threshold: 150 };

function loadEntry(): Entry {
  const fallback = { ...DEFAULT_ENTRY, day: today() };
  try {
    const raw = window.localStorage.getItem(ENTRY_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      market: typeof parsed?.market === "string" && parsed.market ? parsed.market : fallback.market,
      day: /^\d{4}-\d{2}-\d{2}$/.test(parsed?.day) ? parsed.day : fallback.day,
      hour: Number.isInteger(parsed?.hour) && parsed.hour >= 0 && parsed.hour < 24 ? parsed.hour : fallback.hour,
      threshold:
        Number.isInteger(parsed?.threshold) && parsed.threshold > 0 ? parsed.threshold : fallback.threshold,
    };
  } catch {
    return fallback;
  }
}

function saveEntry(entry: Entry) {
  try {
    window.localStorage.setItem(ENTRY_KEY, JSON.stringify(entry));
  } catch {
    // ignore storage failures
  }
}

/**
 * What to do about a stretch, in words.
 *
 * The figures above it are exact and say nothing on their own: a rate of 4.2
 * is only high against a ceiling. This is the one line to act on, so it names
 * the direction, the number, and what that number would have given.
 */
/** What a line was measured on, kept out of the row and left on hover. */
const sampleOf = (stat: Stat) =>
  `Mesuré sur ${stat.days} jour${stat.days > 1 ? "s" : ""}, ${stat.sessions} heure${stat.sessions > 1 ? "s" : ""} enregistrée${stat.sessions > 1 ? "s" : ""}`;

/**
 * Days a stretch needs before its rate is a cadence rather than a mood.
 *
 * Days and not hours: four hours can be a single morning, and a setting moved
 * on one morning chases yesterday. Five days is a full trading week, which is
 * the unit a threshold is actually chosen over — and it takes in the whole
 * spread, a dead Monday and a payrolls Friday included, rather than whichever
 * four days happened to come first.
 */
const ENOUGH_DAYS = 5;

function advice(stat: Stat, ceiling: number, floor: number): { text: string; tone: string } {
  // Before this the rate is still shown — it is exact — but nothing is advised
  // on the strength of it.
  if (stat.days < ENOUGH_DAYS) {
    return {
      tone: "oklch(0.5 0.02 250)",
      text: `${stat.days} jour${stat.days > 1 ? "s" : ""} sur ${ENOUGH_DAYS} — pas encore de quoi juger`,
    };
  }

  if (stat.rate < floor) {
    return {
      tone: "oklch(0.8 0.14 85)",
      text:
        stat.lowerTo === null
          ? `trop peu d'alertes — descends le seuil, pas de quoi estimer de combien`
          : `trop peu d'alertes — descends vers ${stat.lowerTo} (estimé, jamais observé si bas)`,
    };
  }

  if (stat.rate > ceiling) {
    return {
      tone: accentColor,
      text:
        stat.recommended === null
          ? "trop d'alertes — aucun seuil relu ne tient le plafond"
          : `trop d'alertes en moyenne — monte à ${stat.recommended}, ça donnerait ${stat.recommendedRate?.toFixed(1)}/h`,
    };
  }

  return { tone: "oklch(0.62 0.03 250)", text: `dans la fourchette — garde ${stat.threshold}` };
}

/** "lundi 07.09" — the weekday first, because the weekday is what is compared. */
const dayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`);
  const weekday = date.toLocaleDateString("fr-FR", { weekday: "long" });
  const [, month, dayOfMonth] = day.split("-");
  return `${weekday} ${dayOfMonth}.${month}`;
};

/**
 * The alert's own logbook: what it fired, hour by hour, and what it should be
 * set to next.
 *
 * An hour is the unit because an hour is what varies — 3h and 7h are not the
 * same market on the same day, and a setting averaged over a session hides
 * exactly the difference worth acting on.
 */
export default function VolumeAlertClient({ hours, news }: { hours: AlertHour[]; news: NewsRelease[] }) {
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS);
  const [market, setMarket] = useState(DEFAULT_ENTRY.market);

  const [day, setDay] = useState(today);
  const [hour, setHour] = useState(DEFAULT_ENTRY.hour);
  const [threshold, setThreshold] = useState(DEFAULT_ENTRY.threshold);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);

  /** The most alerts an hour may show before the setting is too low. */
  const [ceiling, setCeiling] = useState(DEFAULT_LIMITS.ceiling);
  /**
   * The fewest before it is too high. Zero turns it off, which is the default:
   * a quiet hour is an answer, and only a band that stays quiet over many hours
   * is a mis-set alert.
   */
  const [floor, setFloor] = useState(DEFAULT_LIMITS.floor);

  /**
   * The stretch the alert is actually set for.
   *
   * Before the cash open and after it are two different markets: the same
   * threshold that sits right at 3h floods the afternoon. One stretch at a
   * time, chosen here — a reading is made about the hours the alert is meant
   * to cover, and the rest of the day only dilutes it. Kept per browser, the
   * way the market list is: it is a habit, not data.
   */
  const [session, setSession] = useState<Session>(DEFAULT_SESSION);

  /** The form up top, so a line of the logbook can send you back to it. */
  const form = useRef<HTMLDivElement>(null);

  /** The threshold the logbook is replayed at. Zero is off. */
  const [sim, setSim] = useState(0);

  /**
   * Whether the hours a figure came out in are left out of the reading.
   *
   * A payrolls hour at twenty-eight alerts is not the setting being wrong, it
   * is the market doing what it does around a release, and averaged in it
   * pushes the threshold up for every ordinary hour of the week. Left out of
   * the reading, kept in the logbook: the hour happened.
   */
  const [skipNews, setSkipNews] = useState(false);

  /** How far back a reading looks, in days. Null is everything recorded. */
  const [window, setWindow] = useState<number | null>(7);

  useEffect(() => {
    const stored = loadMarkets();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, as the market list lives in the browser
    setMarkets(stored);
    setSession(loadSession());
    setSim(loadSim());
    try {
      setSkipNews(globalThis.localStorage?.getItem(SKIP_NEWS_KEY) === "1");
    } catch {
      // ignore storage failures
    }
    const limits = loadLimits();
    setFloor(limits.floor);
    setCeiling(limits.ceiling);

    const entry = loadEntry();
    // A market dropped from the list since is not selectable any more.
    setMarket(stored.includes(entry.market) ? entry.market : stored[0]);
    setDay(entry.day);
    setHour(entry.hour);
    setThreshold(entry.threshold);
  }, []);

  /**
   * Move the form, and write where it now stands.
   *
   * Written here rather than from an effect watching the four fields: such an
   * effect also fires on the way up from the defaults, so it races the read
   * that brings the stored hour back. Every field moves through this.
   */
  function choose(next: Partial<Entry>) {
    const entry: Entry = { market, day, hour, threshold, ...next };
    setMarket(entry.market);
    setDay(entry.day);
    setHour(entry.hour);
    setThreshold(entry.threshold);
    saveEntry(entry);
  }

  /**
   * The releases, filed under the hour they fell in.
   *
   * Turned into a wall clock here and not on the server, which runs in UTC:
   * the recorded day and hour are the reader's own clock, so the release has
   * to be read on that same clock or it lands an hour or two off.
   */
  const newsByHour = useMemo(() => {
    const index = new Map<string, NewsRelease[]>();
    for (const release of news) {
      const at = new Date(release.at);
      if (Number.isNaN(at.getTime())) continue;
      const key = `${at.toLocaleDateString("en-CA")} ${at.getHours()}`;
      (index.get(key) ?? index.set(key, []).get(key)!).push(release);
    }
    return index;
  }, [news]);

  const newsIn = (hour: AlertHour) => newsByHour.get(`${hour.day} ${hour.hour}`) ?? [];

  const mine = useMemo(() => hours.filter((h) => h.market === market), [hours, market]);

  /** What the readings are made on: the logbook, less the news hours if asked. */
  const kept = useMemo(
    () => (skipNews ? mine.filter((hour) => !newsByHour.has(`${hour.day} ${hour.hour}`)) : mine),
    [mine, skipNews, newsByHour],
  );
  const read = useMemo(() => recent(kept, window), [kept, window]);
  const stats = useMemo(() => bandStats(read, ceiling, floor), [read, ceiling, floor]);
  const bySession = useMemo(() => sessionStats(read, [session], ceiling, floor), [read, session, ceiling, floor]);
  const bands = useMemo(() => byHour(mine), [mine]);

  /**
   * The logbook as a whole, at the threshold in force and at the simulated one.
   *
   * Averaged per hour recorded, which is the figure the ceiling is set in. The
   * two are not always over the same hours: an hour watched above the simulated
   * threshold cannot answer for it, so it is left out and counted here instead.
   */
  const totals = useMemo(() => {
    const asRecorded = kept.reduce((n, hour) => n + countAt(hour, hour.threshold), 0);
    const readable = sim > 0 ? kept.filter((hour) => canAnswer(hour, sim)) : [];
    const simulated = readable.reduce((n, hour) => n + countAt(hour, sim), 0);
    return {
      hours: kept.length,
      recorded: kept.length ? asRecorded / kept.length : 0,
      readable: readable.length,
      simulated: readable.length ? simulated / readable.length : null,
    };
  }, [kept, sim]);

  const values = parseValues(raw);

  async function save() {
    // An empty hour is written down as it stands: a quiet hour is a reading,
    // and asking about it every time turns the commonest entry into a dialog.
    setSaving(true);
    await saveAlertHour({ day, hour, threshold, values, market });
    setRaw("");
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div ref={form} style={{ ...glassCard, scrollMarginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ ...label, marginBottom: 0, marginRight: 4 }}>Marché</div>
          {markets.map((m) => (
            <button
              key={m}
              onClick={() => choose({ market: m })}
              style={{
                ...mono,
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${m === market ? accentColor : "oklch(0.32 0.02 250)"}`,
                background: m === market ? "oklch(0.72 0.14 195 / 0.14)" : "transparent",
                color: m === market ? accentColor : "oklch(0.6 0.02 250)",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "140px 110px 110px 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={label}>Jour</div>
            <input type="date" value={day} onChange={(e) => choose({ day: e.target.value })} style={field} />
          </div>
          <div>
            <div style={label}>Heure</div>
            <select value={hour} onChange={(e) => choose({ hour: Number(e.target.value) })} style={field}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {bandLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Seuil</div>
            <NumberField value={threshold} onChange={(next) => choose({ threshold: next })} min={1} max={99999} width="100%" />
          </div>
          <div>
            <div style={label}>Valeurs des box</div>
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="243 187 156"
              style={field}
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            style={{
              ...mono,
              fontSize: 12,
              padding: "7px 16px",
              borderRadius: 4,
              cursor: "pointer",
              border: `1px solid ${accentColor}`,
              background: "oklch(0.72 0.14 195 / 0.16)",
              color: accentColor,
            }}
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>

        {/* What was understood, before it is written down. A mistyped separator
            shows up here as a 1 and a 36 rather than in next week's reading. */}
        <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginTop: 8 }}>
          {values.length ? (
            <>
              {values.length} alerte{values.length > 1 ? "s" : ""} ·{" "}
              {values.map((value, i) => (
                <span key={i} style={value < threshold ? { color: lossColor } : undefined}>
                  {i > 0 && " · "}
                  {value}
                </span>
              ))}
              {values.some((v) => v < threshold) && (
                <span style={{ color: lossColor }}> — en rouge, sous le seuil : l&apos;alerte n&apos;a pas pu les tirer</span>
              )}
            </>
          ) : (
            "Le seuil est celui qui était réglé à ce moment-là : il dit jusqu'où cette heure peut être relue."
          )}
        </div>
      </div>

      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Par session</div>
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>de</div>
          <NumberField
            value={session.start}
            onChange={(start) => {
              const next = { ...session, start };
              setSession(next);
              saveSession(next);
            }}
            min={0}
            max={23}
            width={52}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>h à</div>
          <NumberField
            value={session.end}
            onChange={(end) => {
              const next = { ...session, end };
              setSession(next);
              saveSession(next);
            }}
            min={0}
            max={23}
            width={52}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)", marginRight: 8 }}>h, pour</div>
          <NumberField
            value={floor}
            onChange={(next) => {
              setFloor(next);
              saveLimits({ floor: next, ceiling });
            }}
            min={0}
            max={99}
            width={52}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>à</div>
          <NumberField
            value={ceiling}
            onChange={(next) => {
              setCeiling(next);
              saveLimits({ floor, ceiling: next });
            }}
            min={1}
            max={99}
            width={52}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>alertes par heure</div>
          <button
            onClick={() => {
              const next = !skipNews;
              setSkipNews(next);
              try {
                globalThis.localStorage?.setItem(SKIP_NEWS_KEY, next ? "1" : "0");
              } catch {
                // ignore storage failures
              }
            }}
            title="Les heures où un chiffre à fort impact est sorti, laissées hors des moyennes et des recommandations. Elles restent dans le journal."
            style={{
              ...mono,
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${skipNews ? newsColor : "oklch(0.3 0.02 250)"}`,
              background: skipNews ? newsColor.replace(")", " / 0.14)") : "transparent",
              color: skipNews ? newsColor : "oklch(0.55 0.02 250)",
            }}
          >
            sans les news
          </button>
          <div style={{ display: "flex", gap: 5, marginLeft: "auto", alignItems: "center" }}>
            {/* A threshold is judged over a week, not over a morning: the
                reading looks back rather than piling up every day ever kept. */}
            <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginRight: 3 }}>sur</span>
            {([7, 14, null] as const).map((days) => (
              <button
                key={String(days)}
                onClick={() => setWindow(days)}
                style={{
                  ...mono,
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${window === days ? accentColor : "oklch(0.3 0.02 250)"}`,
                  background: window === days ? "oklch(0.72 0.14 195 / 0.14)" : "transparent",
                  color: window === days ? accentColor : "oklch(0.55 0.02 250)",
                }}
              >
                {days === null ? "tout" : `${days} j`}
              </button>
            ))}
          </div>
        </div>

        {skipNews && mine.length > kept.length && (
          <div style={{ ...mono, fontSize: 10.5, color: newsColor, marginBottom: 10 }}>
            {mine.length - kept.length} heure{mine.length - kept.length > 1 ? "s" : ""} de news laissée
            {mine.length - kept.length > 1 ? "s" : ""} de côté
          </div>
        )}

        {bySession.length === 0 && (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
            Aucune heure enregistrée ne tombe dans cette plage.
          </div>
        )}

        {bySession.map((stat) => {
          const said = advice(stat, ceiling, floor);
          return (
            <div
              key={sessionLabel(stat.session)}
              title={sampleOf(stat)}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                padding: "10px 0",
                borderTop: "1px solid oklch(0.28 0.03 250 / 0.5)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ ...mono, fontSize: 13, color: "oklch(0.88 0.02 250)", width: 76, flex: "none" }}>
                {sessionLabel(stat.session)}
              </span>
              <span style={{ ...mono, fontSize: 12, flex: "none", color: "oklch(0.75 0.02 250)" }}>
                {stat.threshold} → {stat.rate.toFixed(1)}/h
              </span>
              <span style={{ ...mono, fontSize: 12, flex: 1, minWidth: 240, color: said.tone }}>{said.text}</span>
            </div>
          );
        })}
      </div>

      {/* Only once it pools several days. On the first day an hour band holds a
          single entry, so this block repeats the recorded list underneath it
          line for line — an average over one observation is that observation. */}
      {stats.some((band) => band.days > 1) && (
      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Heure par heure</div>
          <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)" }}>
            le détail sous les plages, quand une heure porte la session à elle seule
          </div>
        </div>

        {stats.length === 0 && (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
            Rien d&apos;enregistré sur {market}. Une heure suffit pour voir la courbe.
          </div>
        )}

        {stats.map((band) => (
          <div
            key={band.hour}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: "9px 0",
              borderTop: "1px solid oklch(0.28 0.03 250 / 0.5)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ ...mono, fontSize: 12, color: "oklch(0.85 0.02 250)", width: 62, flex: "none" }}>
              {bandLabel(band.hour)}
            </span>
            <span
              style={{
                ...mono,
                fontSize: 11.5,
                flex: "none",
                color: band.rate > ceiling ? lossColor : band.rate < floor ? "oklch(0.8 0.14 85)" : "oklch(0.7 0.02 250)",
              }}
            >
              {band.threshold} → {band.rate.toFixed(1)}/h
            </span>
            <span style={{ ...mono, fontSize: 11.5, flex: 1, minWidth: 200, color: advice(band, ceiling, floor).tone }}>
              {advice(band, ceiling, floor).text}
            </span>
          </div>
        ))}


      </div>
      )}

      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Heures enregistrées</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)" }}>simulation d&apos;alerte</span>
            <NumberField
              value={sim}
              onChange={(next) => {
                setSim(next);
                saveSim(next);
              }}
              min={0}
              max={99999}
              width={66}
            />
            {sim > 0 && (
              <button
                onClick={() => {
                  setSim(0);
                  saveSim(0);
                }}
                style={{ ...mono, fontSize: 10, background: "none", border: "none", color: "oklch(0.5 0.02 250)", cursor: "pointer" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {bands.length === 0 && (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>Rien encore.</div>
        )}

        {/* Named once, at the top: the columns repeat under every band. */}
        {bands.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 0 6px",
              ...mono,
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "oklch(0.48 0.02 250)",
            }}
          >
            <span style={col.day}>jour</span>
            <span style={{ ...col.count, textAlign: "center" }}>alertes</span>
            {sim > 0 && (
              <span style={{ ...col.count, textAlign: "center", color: simColor }}>à {sim}</span>
            )}
            <span style={col.threshold}>seuil</span>
            <span style={col.actions} />
          </div>
        )}
        {/* The band leads and the days sit under it: what is read back here is
            the same hour from one day to the next, not a day's worth of hours.
            The count is the line — the boxes themselves are behind "corriger". */}
        {bands.map(([bandHour, rows]) => (
          <div key={bandHour} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0 8px" }}>
              <span
                style={{
                  ...mono,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: accentColor,
                  textShadow: neonGlow(accentColor, 1),
                }}
              >
                {bandLabel(bandHour)}
              </span>
              <span style={{ flex: 1, height: 1, background: "oklch(0.84 0.17 196 / 0.18)" }} />
              <span style={{ ...mono, fontSize: 10, color: "oklch(0.5 0.02 250)" }}>
                {rows.length} {rows.length > 1 ? "jours" : "jour"}
              </span>
            </div>
            {rows.map((row) => {
              const count = countAt(row, row.threshold);
              const released = newsIn(row);
              // The count carries the reading, so it carries the colour: lit
              // when the hour fired, magenta past the ceiling, unlit at zero.
              const tone =
                count === 0
                  ? "oklch(0.45 0.02 250)"
                  : count > ceiling
                    ? lossColor
                    : count < floor
                      ? "oklch(0.8 0.14 85)"
                      : accentColor;
              return (
                <div
                  key={row.day}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "5px 0",
                    borderTop: "1px solid oklch(0.26 0.03 250 / 0.35)",
                  }}
                >
                  <span
                    style={{
                      ...mono,
                      ...col.day,
                      fontSize: 11.5,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: row.day === today() ? accentColor : "oklch(0.72 0.02 250)",
                      opacity: skipNews && released.length > 0 ? 0.5 : 1,
                    }}
                  >
                    <span style={{ textTransform: "capitalize" }}>{dayLabel(row.day)}</span>
                    {/* Named rather than flagged: which figure it was decides
                        whether the hour is worth reading at all. */}
                    {released.length > 0 && (
                      <span
                        title={`${released.map((r) => `${r.currency} ${r.title}`).join(" · ")}${
                          skipNews ? " — hors des moyennes" : ""
                        }`}
                        style={{
                          ...mono,
                          fontSize: 9,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          padding: "1px 5px",
                          borderRadius: 3,
                          border: `1px solid ${newsColor.replace(")", " / 0.5)")}`,
                          color: newsColor,
                          whiteSpace: "nowrap",
                        }}
                      >
                        news
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      ...mono,
                      ...col.count,
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: "center",
                      padding: "2px 0",
                      color: tone,
                      border: `1px solid ${count === 0 ? "oklch(0.32 0.02 250)" : tone.replace(")", " / 0.5)")}`,
                      background: count === 0 ? "none" : tone.replace(")", " / 0.1)"),
                      textShadow: count === 0 ? "none" : neonGlow(tone, 1),
                    }}
                  >
                    {count}
                  </span>
                  {sim > 0 && (
                    <span
                      title={
                        canAnswer(row, sim)
                          ? `À ${sim}, cette heure aurait donné ${countAt(row, sim)} alerte(s) au lieu de ${count}.`
                          : `Cette heure était surveillée à ${row.threshold} : rien n'a été noté sous ce seuil, donc elle ne peut pas répondre pour ${sim}.`
                      }
                      style={{
                        ...mono,
                        ...col.count,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: "center",
                        padding: "2px 0",
                        color: canAnswer(row, sim) ? simColor : "oklch(0.45 0.02 250)",
                        border: `1px dashed ${canAnswer(row, sim) ? simColor.replace(")", " / 0.55)") : "oklch(0.32 0.02 250)"}`,
                        background: canAnswer(row, sim) ? simColor.replace(")", " / 0.1)") : "none",
                        textShadow: canAnswer(row, sim) ? neonGlow(simColor, 1) : "none",
                      }}
                    >
                      {canAnswer(row, sim) ? countAt(row, sim) : "—"}
                    </span>
                  )}
                  <span style={{ ...mono, ...col.threshold, fontSize: 11, color: "oklch(0.55 0.02 250)" }}>
                    {row.threshold}
                  </span>
                  <span style={{ ...col.actions, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        // The line goes back into the form, and the page goes
                        // with it: an hour is corrected where it was typed.
                        choose({ day: row.day, hour: row.hour, threshold: row.threshold });
                        setRaw(row.values.join(" "));
                        form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      style={{ ...mono, fontSize: 10, background: "none", border: "none", color: accentColor, cursor: "pointer", padding: 0 }}
                    >
                      modifier
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {/* The two readings side by side: what the alert gave, and what it
            would have given. Per hour recorded, the figure the ceiling is in. */}
        {totals.hours > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              flexWrap: "wrap",
              paddingTop: 12,
              borderTop: "1px solid oklch(0.84 0.17 196 / 0.18)",
            }}
          >
            <span style={{ ...mono, fontSize: 11, color: "oklch(0.5 0.02 250)" }}>
              moyenne sur {totals.hours} heure{totals.hours > 1 ? "s" : ""}
            </span>
            <span style={{ ...mono, fontSize: 12, color: accentColor, textShadow: neonGlow(accentColor, 1) }}>
              {totals.recorded.toFixed(1)}/h <span style={{ color: "oklch(0.5 0.02 250)", textShadow: "none" }}>tel qu&apos;encodé</span>
            </span>
            {sim > 0 && (
              <span style={{ ...mono, fontSize: 12, color: totals.simulated === null ? "oklch(0.45 0.02 250)" : "oklch(0.82 0.02 250)" }}>
                {totals.simulated === null ? "—" : `${totals.simulated.toFixed(1)}/h`}{" "}
                <span style={{ color: "oklch(0.5 0.02 250)" }}>
                  à {sim}
                  {totals.readable < totals.hours &&
                    ` · sur ${totals.readable} heure${totals.readable > 1 ? "s" : ""} lisible${totals.readable > 1 ? "s" : ""}`}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
