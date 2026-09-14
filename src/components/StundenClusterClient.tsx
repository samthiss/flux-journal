"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accentColor, glassCard, lossColor, neonGlow } from "@/lib/theme";
import { DEFAULT_MARKETS, loadMarkets } from "@/lib/markets";
import { canAnswer, countAt, dayStats, recent, type AlertDay } from "@/lib/volumeAlerts";
import { saveAlertDay } from "@/lib/actions/volumeAlertDays";

const mono = { fontFamily: "var(--font-jetbrains-mono), monospace" } as const;

const field = {
  ...mono,
  width: "100%",
  padding: "6px 9px",
  borderRadius: 4,
  border: "1px solid oklch(0.34 0.02 250)",
  background: "oklch(0.15 0.02 250)",
  color: "oklch(0.9 0.02 250)",
  fontSize: 12,
} as const;

const label = {
  ...mono,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "oklch(0.5 0.02 250)",
  marginBottom: 5,
} as const;

/**
 * The clusters a day may hold.
 *
 * One to three: a day with none was not worth watching, and a day with six is
 * an alert firing on the ordinary tape. Unlike the hourly reading, the floor is
 * on by default — a day is long enough that silence over it is a mis-set alert
 * rather than a quiet market.
 */
const DEFAULT_LIMITS = { floor: 1, ceiling: 3 };

const LIMITS_KEY = "stundenClusterLimits";
const ENTRY_KEY = "stundenClusterEntry";

const ZONE_KEY = "volumeAlertZone";
const DEFAULT_ZONE = "America/Chicago";

/** Today, on the clock the days are written on — the exchange's, not this machine's. */
function today(zone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    ...(zone ? { timeZone: zone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

/** "lundi 07.09", the weekday first — a week is read by its days. */
const dayLabel = (day: string) => {
  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long" });
  const [, month, dayOfMonth] = day.split("-");
  return `${weekday} ${dayOfMonth}.${month}`;
};

const parseValues = (raw: string): number[] =>
  raw
    .split(/[\s,;·]+/)
    .map((piece) => Number(piece.replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

const ENOUGH_DAYS = 5;

/**
 * The day's clusters, tuned the way the hourly alert is.
 *
 * What is written down is the hour totals that crossed the setting — "2000,
 * 2100, 2400" for a Monday watched at 1900 — so any higher threshold can be
 * recounted exactly. The unit is the day: one to three clusters in it, not one
 * to five alerts in an hour.
 */
export default function StundenClusterClient({ days }: { days: AlertDay[] }) {
  const [markets, setMarkets] = useState<string[]>(DEFAULT_MARKETS);
  const [market, setMarket] = useState("6B");
  const [zone, setZone] = useState(DEFAULT_ZONE);

  const [day, setDay] = useState(() => today(DEFAULT_ZONE));
  const [threshold, setThreshold] = useState(1900);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);

  const [floor, setFloor] = useState(DEFAULT_LIMITS.floor);
  const [ceiling, setCeiling] = useState(DEFAULT_LIMITS.ceiling);
  const [window, setWindow] = useState<number | null>(14);
  const [sim, setSim] = useState(0);

  const form = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadMarkets();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, as these live in the browser
    setMarkets(stored);

    const clock = read<string>(ZONE_KEY, DEFAULT_ZONE);
    setZone(typeof clock === "string" ? clock : DEFAULT_ZONE);

    const limits = read(LIMITS_KEY, DEFAULT_LIMITS);
    if (Number.isInteger(limits.floor)) setFloor(limits.floor);
    if (Number.isInteger(limits.ceiling)) setCeiling(limits.ceiling);

    const entry = read(ENTRY_KEY, { market: "6B", threshold: 1900 });
    if (stored.includes(entry.market)) setMarket(entry.market);
    else setMarket(stored[0]);
    if (Number.isInteger(entry.threshold) && entry.threshold > 0) setThreshold(entry.threshold);
    setDay(today(typeof clock === "string" ? clock : DEFAULT_ZONE));
  }, []);

  const mine = useMemo(() => days.filter((d) => d.market === market), [days, market]);
  const kept = useMemo(() => recentDays(mine, window), [mine, window]);
  const stat = useMemo(() => (kept.length ? dayStats(kept, ceiling, floor) : null), [kept, ceiling, floor]);

  const values = parseValues(raw);

  async function save() {
    setSaving(true);
    await saveAlertDay({ day, threshold, values, market });
    setRaw("");
    setSaving(false);
  }

  function choose(next: { market?: string; threshold?: number }) {
    const entry = { market, threshold, ...next };
    setMarket(entry.market);
    setThreshold(entry.threshold);
    write(ENTRY_KEY, entry);
  }

  const simRate = useMemo(() => {
    if (sim <= 0) return null;
    const readable = kept.filter((d) => canAnswer({ ...d, hour: 0 }, sim));
    if (readable.length === 0) return null;
    return readable.reduce((n, d) => n + countAt({ ...d, hour: 0 }, sim), 0) / readable.length;
  }, [kept, sim]);

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

        <div style={{ display: "grid", gridTemplateColumns: "150px 110px 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={label}>Jour</div>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={field} />
          </div>
          <div>
            <div style={label}>Seuil</div>
            <input
              type="number"
              value={threshold}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) choose({ threshold: Math.round(next) });
              }}
              style={field}
            />
          </div>
          <div>
            <div style={label}>Volumes horaires</div>
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="2000 2100 2400"
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

        <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginTop: 8 }}>
          {values.length ? (
            <>
              {values.length} cluster{values.length > 1 ? "s" : ""} ·{" "}
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
            "Les totaux horaires qui ont dépassé le seuil ce jour-là. Un jour sans cluster s'enregistre vide."
          )}
        </div>
      </div>

      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Par jour</div>
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>de</div>
          <input
            type="number"
            value={floor}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isInteger(next) && next >= 0) {
                setFloor(next);
                write(LIMITS_KEY, { floor: next, ceiling });
              }
            }}
            style={{ ...field, width: 52, padding: "3px 7px", fontSize: 11.5 }}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>à</div>
          <input
            type="number"
            value={ceiling}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isInteger(next) && next >= 1) {
                setCeiling(next);
                write(LIMITS_KEY, { floor, ceiling: next });
              }
            }}
            style={{ ...field, width: 52, padding: "3px 7px", fontSize: 11.5 }}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>clusters par jour</div>
          <div style={{ display: "flex", gap: 5, marginLeft: "auto", alignItems: "center" }}>
            <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginRight: 3 }}>sur</span>
            {([7, 14, null] as const).map((n) => (
              <button
                key={String(n)}
                onClick={() => setWindow(n)}
                style={{
                  ...mono,
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${window === n ? accentColor : "oklch(0.3 0.02 250)"}`,
                  background: window === n ? "oklch(0.72 0.14 195 / 0.14)" : "transparent",
                  color: window === n ? accentColor : "oklch(0.55 0.02 250)",
                }}
              >
                {n === null ? "tout" : `${n} j`}
              </button>
            ))}
          </div>
        </div>

        {stat === null ? (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>
            Rien d&apos;enregistré sur {market}. Un jour suffit pour commencer.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 13, color: "oklch(0.88 0.02 250)" }}>
                {stat.threshold} → {stat.rate.toFixed(1)} cluster{stat.rate >= 2 ? "s" : ""} par jour
              </span>
              <span
                style={{
                  ...mono,
                  fontSize: 12,
                  color:
                    stat.days < ENOUGH_DAYS
                      ? "oklch(0.5 0.02 250)"
                      : stat.rate > ceiling
                        ? accentColor
                        : stat.rate < floor
                          ? "oklch(0.8 0.14 85)"
                          : "oklch(0.62 0.03 250)",
                }}
              >
                {stat.days < ENOUGH_DAYS
                  ? `${stat.days} jour${stat.days > 1 ? "s" : ""} sur ${ENOUGH_DAYS} — pas encore de quoi juger`
                  : stat.rate > ceiling
                    ? stat.recommended === null
                      ? "trop de clusters — aucun seuil relu ne tient le plafond"
                      : `trop de clusters — monte à ${stat.recommended}, ça donnerait ${stat.recommendedRate?.toFixed(1)}/jour`
                    : stat.rate < floor
                      ? stat.lowerTo === null
                        ? "trop peu de clusters — descends le seuil, pas de quoi estimer de combien"
                        : `trop peu de clusters — descends vers ${stat.lowerTo} (estimé, jamais observé si bas)`
                      : `dans la fourchette — garde ${stat.threshold}`}
              </span>
            </div>
          </>
        )}
      </div>

      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Jours enregistrés</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)" }}>simulation d&apos;alerte</span>
            <input
              type="number"
              value={sim || ""}
              onChange={(e) => setSim(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              placeholder="0"
              style={{ ...field, width: 78, padding: "3px 7px", fontSize: 11.5 }}
            />
          </div>
        </div>

        {mine.length === 0 && (
          <div style={{ fontSize: 12.5, color: "oklch(0.6 0.03 250)" }}>Rien encore.</div>
        )}

        {mine.map((row) => {
          const count = countAt({ ...row, hour: 0 }, row.threshold);
          const tone =
            count === 0
              ? "oklch(0.45 0.02 250)"
              : count > ceiling
                ? lossColor
                : count < floor
                  ? "oklch(0.8 0.14 85)"
                  : accentColor;
          const answers = sim > 0 && canAnswer({ ...row, hour: 0 }, sim);
          return (
            <div
              key={row.day}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 0",
                borderTop: "1px solid oklch(0.26 0.03 250 / 0.35)",
              }}
            >
              <span
                style={{
                  ...mono,
                  fontSize: 11.5,
                  minWidth: 116,
                  flex: 1,
                  textTransform: "capitalize",
                  color: row.day === today(zone) ? accentColor : "oklch(0.72 0.02 250)",
                }}
              >
                {dayLabel(row.day)}
              </span>
              <span
                title={`${count} cluster${count > 1 ? "s" : ""} au seuil de ${row.threshold}`}
                style={{
                  ...mono,
                  width: 46,
                  flex: "none",
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
                    answers
                      ? `À ${sim}, ce jour aurait donné ${countAt({ ...row, hour: 0 }, sim)} cluster(s) au lieu de ${count}.`
                      : `Ce jour était surveillé à ${row.threshold} : rien n'a été noté sous ce seuil.`
                  }
                  style={{
                    ...mono,
                    width: 46,
                    flex: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: "center",
                    padding: "2px 0",
                    color: answers ? "oklch(0.78 0.16 305)" : "oklch(0.45 0.02 250)",
                    border: `1px dashed ${answers ? "oklch(0.78 0.16 305 / 0.55)" : "oklch(0.32 0.02 250)"}`,
                    background: answers ? "oklch(0.78 0.16 305 / 0.1)" : "none",
                  }}
                >
                  {answers ? countAt({ ...row, hour: 0 }, sim) : "—"}
                </span>
              )}
              <button
                onClick={() => {
                  choose({ threshold: row.threshold });
                  setDay(row.day);
                  setRaw(row.values.join(" "));
                  form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{ ...mono, fontSize: 10, background: "none", border: "none", color: accentColor, cursor: "pointer", padding: 0 }}
              >
                modifier
              </button>
            </div>
          );
        })}

        {sim > 0 && simRate !== null && (
          <div
            style={{
              ...mono,
              fontSize: 11.5,
              color: "oklch(0.78 0.16 305)",
              paddingTop: 12,
              marginTop: 6,
              borderTop: "1px solid oklch(0.84 0.17 196 / 0.18)",
            }}
          >
            à {sim} → {simRate.toFixed(1)} cluster{simRate >= 2 ? "s" : ""} par jour
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The days falling in the last `n` days, counted back from the newest recorded.
 *
 * A rolling window rather than the calendar week, for the same reason the
 * hourly reading uses one: a week gives one Monday, and counting back from
 * today instead of from the newest day empties the reading over a weekend.
 */
function recentDays(days: AlertDay[], n: number | null): AlertDay[] {
  if (n === null || days.length === 0) return days;
  const within = new Set(recent(days.map((d) => ({ ...d, hour: 0 })), n).map((d) => d.day));
  return days.filter((d) => within.has(d.day));
}
