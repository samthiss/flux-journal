"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { accentColor } from "@/lib/theme";
import VolumeAlertClient, { type NewsRelease } from "@/components/VolumeAlertClient";
import StundenClusterClient from "@/components/StundenClusterClient";
import type { AlertDay, AlertHour } from "@/lib/volumeAlerts";

/**
 * Two readings of the same alert, at two storeys.
 *
 * "Box cluster" tunes what fires inside an hour, box by box; "Stunden cluster"
 * tunes what fires across a day, hour by hour. Same recount, different unit —
 * one to five alerts in an hour is not one to three clusters in a day — so they
 * keep their own settings rather than sharing a page.
 */
const TABS = [
  { key: "box", label: "Box cluster" },
  { key: "stunden", label: "Stunden cluster" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_KEY = "volumeAlertTab";

const tabStyle = (active: boolean): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  background: active ? accentColor : "transparent",
  color: active ? "oklch(0.12 0.017 250)" : "oklch(0.7 0.034 250)",
  border: `1px solid ${active ? accentColor : "oklch(0.4 0.034 250)"}`,
});

export default function VolumeAlertTabs({
  hours,
  days,
  news,
}: {
  hours: AlertHour[];
  days: AlertDay[];
  news: NewsRelease[];
}) {
  const [tab, setTab] = useState<TabKey>("box");

  useEffect(() => {
    try {
      const stored = globalThis.localStorage?.getItem(TAB_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the tab last used lives in the browser
      if (TABS.some((t) => t.key === stored)) setTab(stored as TabKey);
    } catch {
      // ignore storage failures
    }
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              try {
                globalThis.localStorage?.setItem(TAB_KEY, t.key);
              } catch {
                // ignore storage failures
              }
            }}
            style={tabStyle(tab === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "box" ? (
        <VolumeAlertClient hours={hours} news={news} />
      ) : (
        <StundenClusterClient days={days} />
      )}
    </div>
  );
}
