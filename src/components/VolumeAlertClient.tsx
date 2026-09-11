"use client";

import { useEffect, useMemo, useState } from "react";
import { accentColor, glassCard, lossColor } from "@/lib/theme";
import { DEFAULT_MARKETS, loadMarkets } from "@/lib/markets";
import { bandLabel, bandStats, byDay, countAt, type AlertHour } from "@/lib/volumeAlerts";
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

/** "243 187, 156" — typed however it comes out of the chart. */
function parseValues(raw: string): number[] {
  return raw
    .split(/[^\d.]+/)
    .map((piece) => Number(piece))
    .filter((n) => Number.isFinite(n) && n > 0);
}

const today = () => new Date().toLocaleDateString("en-CA");

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

  useEffect(() => {
    const stored = loadMarkets();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, as the market list lives in the browser
    setMarkets(stored);
  }, []);

  const mine = useMemo(() => hours.filter((h) => h.market === market), [hours, market]);
  const stats = useMemo(() => bandStats(mine, ceiling), [mine, ceiling]);
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
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={field}
            />
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

        <div style={{ ...mono, fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginTop: 8 }}>
          {values.length
            ? `${values.length} alerte${values.length > 1 ? "s" : ""} · ${values.join(" · ")}`
            : "Le seuil est celui qui était réglé à ce moment-là : il dit jusqu'où cette heure peut être relue."}
        </div>
      </div>

      <div style={{ ...glassCard }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Réglage recommandé</div>
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>au plus</div>
          <input
            type="number"
            value={ceiling}
            onChange={(e) => setCeiling(Math.max(1, Number(e.target.value)))}
            style={{ ...field, width: 56, padding: "3px 7px", fontSize: 11.5 }}
          />
          <div style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.03 250)" }}>alertes par heure</div>
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
            <span style={{ ...mono, fontSize: 11, color: "oklch(0.55 0.02 250)", width: 92, flex: "none" }}>
              {band.sessions} heure{band.sessions > 1 ? "s" : ""}
            </span>
            <span
              style={{
                ...mono,
                fontSize: 11.5,
                flex: "none",
                color: band.rate > ceiling ? lossColor : "oklch(0.7 0.02 250)",
              }}
            >
              {band.threshold} → {band.rate.toFixed(1)}/h
            </span>
            <span style={{ ...mono, fontSize: 11.5, flex: 1, minWidth: 200, color: accentColor }}>
              {band.recommended === null
                ? "aucun seuil relu ne tient ce plafond"
                : band.recommended <= band.threshold
                  ? `déjà sous le plafond, garde ${band.threshold}`
                  : `passe à ${band.recommended} → ${band.recommendedRate?.toFixed(1)}/h`}
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

        {stats.length > 0 && stats.some((b) => b.sessions < 4) && (
          <div style={{ ...mono, fontSize: 10, color: "oklch(0.5 0.02 250)", marginTop: 10 }}>
            Une tranche à moins de quatre heures enregistrées se lit comme une anecdote, pas comme une cadence.
          </div>
        )}
      </div>

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
