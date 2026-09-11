"use client";

import { useEffect, useMemo, useState } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { DEFAULT_MARKETS, loadMarkets } from "@/lib/markets";
import {
  bandLabel,
  bandStats,
  byDay,
  countAt,
  recent,
  sessionLabel,
  sessionStats,
  type AlertHour,
  type Session,
  type Stat,
} from "@/lib/volumeAlerts";
import { deleteAlertHour, saveAlertHour } from "@/lib/actions/volumeAlerts";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

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

const DEFAULT_SESSIONS: Session[] = [
  { start: 2, end: 7 },
  { start: 7, end: 0 },
];

const SESSIONS_KEY = "volumeAlertSessions";

function loadSessions(): Session[] {
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return DEFAULT_SESSIONS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SESSIONS;
    return parsed.filter(
      (s): s is Session =>
        Number.isInteger(s?.start) && Number.isInteger(s?.end) && s.start >= 0 && s.start < 24 && s.end >= 0 && s.end < 24,
    );
  } catch {
    return DEFAULT_SESSIONS;
  }
}

function saveSessions(sessions: Session[]) {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
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
 * on one morning chases yesterday. Four days is most of a trading week, which
 * is the unit a threshold is actually chosen over.
 */
const ENOUGH_DAYS = 4;

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

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });

/**
 * The alert's own logbook: what it fired, hour by hour, and what it should be
 * set to next.
 *
 * An hour is the unit because an hour is what varies — 3h and 7h are not the
 * same market on the same day, and a setting averaged over a session hides
 * exactly the difference worth acting on.
 */
export default function VolumeAlertClient({ hours }: { hours: AlertHour[] }) {
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS);
  const [market, setMarket] = useState("6B");

  const [day, setDay] = useState(today());
  const [hour, setHour] = useState(7);
  const [threshold, setThreshold] = useState(150);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);

  /** The most alerts an hour may show before the setting is too low. */
  const [ceiling, setCeiling] = useState(5);
  /**
   * The fewest before it is too high. Zero turns it off, which is the default:
   * a quiet hour is an answer, and only a band that stays quiet over many hours
   * is a mis-set alert.
   */
  const [floor, setFloor] = useState(0);

  /**
   * The stretches the alert is actually set for.
   *
   * Before the cash open and after it are two different markets: the same
   * threshold that sits right at 3h floods the afternoon. Kept per browser, the
   * way the market list is — it is a habit, not data.
   */
  const [sessions, setSessions] = useState<Session[]>(DEFAULT_SESSIONS);

  /** How far back a reading looks, in days. Null is everything recorded. */
  const [window, setWindow] = useState<number | null>(7);
  const [editingSessions, setEditingSessions] = useState(false);

  useEffect(() => {
    const stored = loadMarkets();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, as the market list lives in the browser
    setMarkets(stored);
    setSessions(loadSessions());
  }, []);

  const mine = useMemo(() => hours.filter((h) => h.market === market), [hours, market]);
  const read = useMemo(() => recent(mine, window), [mine, window]);
  const stats = useMemo(() => bandStats(read, ceiling, floor), [read, ceiling, floor]);
  const bySession = useMemo(() => sessionStats(read, sessions, ceiling, floor), [read, sessions, ceiling, floor]);
  const days = useMemo(() => byDay(mine), [mine]);

  const values = parseValues(raw);

  async function save() {
    if (!values.length && !confirm("Aucune valeur : enregistrer cette heure comme sans alerte ?")) return;
    setSaving(true);
    await saveAlertHour({ day, hour, threshold, values, market });
    setRaw("");
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ ...label, marginBottom: 0, marginRight: 4 }}>Marché</div>
          {markets.map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
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
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={field} />
          </div>
          <div>
            <div style={label}>Heure</div>
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} style={field}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {bandLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Seuil</div>
            <NumberField value={threshold} onChange={setThreshold} min={1} max={99999} width="100%" />
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
          <NumberField value={floor} onChange={setFloor} min={0} max={99} width={52} />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>à</div>
          <NumberField value={ceiling} onChange={setCeiling} min={1} max={99} width={52} />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>alertes par heure</div>
          <button
            onClick={() => setEditingSessions((v) => !v)}
            style={{
              ...mono,
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${editingSessions ? accentColor : "oklch(0.32 0.02 250)"}`,
              background: "transparent",
              color: editingSessions ? accentColor : "oklch(0.55 0.02 250)",
            }}
          >
            {editingSessions ? "terminé" : "modifier les plages"}
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

        {editingSessions && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {sessions.map((session, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <NumberField
                  value={session.start}
                  onChange={(start) => {
                    const next = sessions.map((s, j) => (j === i ? { ...s, start } : s));
                    setSessions(next);
                    saveSessions(next);
                  }}
                  min={0}
                  max={23}
                  width={52}
                />
                <span style={{ ...mono, fontSize: 11, color: "oklch(0.5 0.02 250)" }}>h →</span>
                <NumberField
                  value={session.end}
                  onChange={(end) => {
                    const next = sessions.map((s, j) => (j === i ? { ...s, end } : s));
                    setSessions(next);
                    saveSessions(next);
                  }}
                  min={0}
                  max={23}
                  width={52}
                />
                <span style={{ ...mono, fontSize: 11, color: "oklch(0.5 0.02 250)" }}>h</span>
                <button
                  onClick={() => {
                    const next = sessions.filter((_, j) => j !== i);
                    setSessions(next);
                    saveSessions(next);
                  }}
                  style={{ ...mono, fontSize: 11, background: "none", border: "none", color: lossColor, cursor: "pointer" }}
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                const next = [...sessions, { start: 14, end: 22 }];
                setSessions(next);
                saveSessions(next);
              }}
              style={{ ...mono, fontSize: 11, background: "none", border: "1px dashed oklch(0.34 0.02 250)", borderRadius: 4, padding: "3px 10px", color: "oklch(0.6 0.02 250)", cursor: "pointer" }}
            >
              + plage
            </button>
          </div>
        )}

        {bySession.length === 0 && (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
            Aucune heure enregistrée ne tombe dans ces plages.
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
            <span style={{ ...mono, fontSize: 10, color: "oklch(0.45 0.02 250)", flex: "none" }}>
              {band.curve
                .filter((_, i) => i % 2 === 0)
                .slice(0, 6)
                .map((p) => `${p.threshold}:${p.rate.toFixed(1)}`)
                .join("  ")}
            </span>
          </div>
        ))}


      </div>
      )}

      <div style={{ ...glassCard }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Heures enregistrées</div>
        {days.length === 0 && (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>Rien encore.</div>
        )}
        {days.map(([d, rows]) => (
          <div key={d} style={{ marginBottom: 12 }}>
            <div
              style={{
                ...mono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: d === today() ? accentColor : "oklch(0.5 0.03 250)",
                padding: "6px 0",
              }}
            >
              {dayLabel(d)}
            </div>
            {rows.map((row) => (
              <div
                key={row.hour}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "6px 0",
                  borderTop: "1px solid oklch(0.26 0.03 250 / 0.35)",
                }}
              >
                <span style={{ ...mono, fontSize: 11.5, width: 62, flex: "none", color: "oklch(0.78 0.02 250)" }}>
                  {bandLabel(row.hour)}
                </span>
                <span style={{ ...mono, fontSize: 11, width: 70, flex: "none", color: "oklch(0.55 0.02 250)" }}>
                  seuil {row.threshold}
                </span>
                <span style={{ ...mono, fontSize: 11.5, width: 40, flex: "none", color: accentColor }}>
                  {countAt(row, row.threshold)}
                </span>
                <span style={{ ...mono, fontSize: 11, flex: 1, minWidth: 0, color: "oklch(0.62 0.02 250)" }}>
                  {row.values.join(" · ") || "aucune alerte"}
                </span>
                <button
                  onClick={() => {
                    setDay(row.day);
                    setHour(row.hour);
                    setThreshold(row.threshold);
                    setRaw(row.values.join(" "));
                  }}
                  style={{ ...mono, fontSize: 10, background: "none", border: "none", color: "oklch(0.55 0.02 250)", cursor: "pointer" }}
                >
                  corriger
                </button>
                <button
                  onClick={() => deleteAlertHour(row.market, row.day, row.hour)}
                  style={{ ...mono, fontSize: 10, background: "none", border: "none", color: lossColor, cursor: "pointer", opacity: 0.75 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
