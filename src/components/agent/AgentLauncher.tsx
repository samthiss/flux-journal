"use client";

/**
 * The agent, reachable from wherever the reader happens to be.
 *
 * A question comes up while looking at something else — a trade being written
 * up, the checklist before a session — and walking to another page to ask it is
 * the friction that stops it being asked. So the panel opens over the page and
 * closes again, and the thread is the same one the agent's own page shows.
 *
 * Rendered through a portal onto the body, and not by preference: anything
 * `position: fixed` inside an element carrying a backdrop-filter is trapped by
 * it, and this app is built out of frosted cards. The bubble would drift or
 * vanish on scroll anywhere inside one.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { accentColor } from "@/lib/theme";
import AgentConversation from "@/components/agent/AgentConversation";
import { useAgent } from "@/components/agent/AgentProvider";

export default function AgentLauncher() {
  const { ouvert, setOuvert, messages, encours } = useAgent();

  // There is no document on the server, so the portal cannot be opened until
  // the browser has taken over. Asked of the runtime rather than kept in state:
  // a flag flipped in an effect re-renders the whole tree for nothing.
  const monte = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Escape closes it, the way every other menu in this app closes.
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (event: KeyboardEvent) => event.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", fermer);
    return () => window.removeEventListener("keydown", fermer);
  }, [ouvert, setOuvert]);

  if (!monte) return null;

  return createPortal(
    <>
      {ouvert && (
        <aside
          style={{
            position: "fixed",
            right: 20,
            bottom: 88,
            top: 20,
            width: "min(440px, calc(100vw - 40px))",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            padding: 16,
            borderRadius: 14,
            border: "1px solid oklch(0.34 0.034 250)",
            background: "oklch(0.13 0.02 250 / 0.97)",
            boxShadow: "0 24px 60px -18px oklch(0 0 0 / 0.7)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12, flex: "none" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Agent journal</div>
            <button
              onClick={() => setOuvert(false)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "oklch(0.6 0.02 250)",
                fontSize: 16,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          <AgentConversation compact />
        </aside>
      )}

      <button
        onClick={() => setOuvert(!ouvert)}
        title="Interroger ton journal"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 61,
          width: 52,
          height: 52,
          borderRadius: "50%",
          cursor: "pointer",
          border: `1px solid ${accentColor}`,
          background: "oklch(0.16 0.03 250)",
          boxShadow: `0 0 18px -4px ${accentColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {ouvert ? (
          <span style={{ color: accentColor, fontSize: 17, lineHeight: 1 }}>✕</span>
        ) : (
          <svg width="22" height="22" viewBox="0 0 18 18">
            <path d="M2 3.5h14v9H7.5L4 16v-3.5H2z" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="9" cy="8" r="1" fill={accentColor} />
            <circle cx="5.5" cy="8" r="1" fill={accentColor} opacity="0.55" />
            <circle cx="12.5" cy="8" r="1" fill={accentColor} opacity="0.55" />
          </svg>
        )}

        {/* A thread waiting to be read, or an answer still being written, while
            the panel is shut. */}
        {!ouvert && (messages.length > 0 || encours) && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: accentColor,
              boxShadow: `0 0 6px ${accentColor}`,
            }}
          />
        )}
      </button>
    </>,
    document.body,
  );
}
