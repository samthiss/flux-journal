"use client";

import { useActionState, useState } from "react";
import { accentColor } from "@/lib/theme";
import { signIn } from "./actions";

const champ = {
  padding: "10px 12px",
  borderRadius: 9,
  border: "1px solid oklch(0.34 0.034 250)",
  background: "oklch(0.16 0.0306 250)",
  color: "oklch(0.92 0 0)",
  fontSize: 13,
  outline: "none",
} as const;

export default function LoginForm({ from }: { from: string }) {
  const [error, formAction, pending] = useActionState(signIn, null);
  /**
   * The owner types a password and nothing else; a guest types the address
   * their account was made with. One form rather than two tabs: the second
   * field is a line away, and a login screen with a choice to make before any
   * typing is a login screen that asks a question nobody came to answer.
   */
  const [partage, setPartage] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        action={formAction}
        style={{
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 28,
          borderRadius: 16,
          border: "1px solid oklch(0.36 0.051 250 / 0.45)",
          background: "oklch(0.19 0.034 250 / 0.55)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>
          TRADING <span style={{ color: accentColor }}>JOURNAL</span>
        </div>

        <input type="hidden" name="from" value={from} />
        {partage && (
          <input name="email" type="email" autoFocus autoComplete="email" placeholder="Email address" style={champ} />
        )}
        <input
          name="password"
          type="password"
          autoFocus={!partage}
          autoComplete="current-password"
          placeholder="Password"
          style={champ}
        />

        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "10px 12px",
            borderRadius: 9,
            border: "none",
            background: accentColor,
            color: "oklch(0.15 0.034 250)",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "…" : "Sign in"}
        </button>

        {error && <div style={{ fontSize: 12, color: "oklch(0.7 0.25 18)" }}>{error}</div>}

        <div
          onClick={() => setPartage((p) => !p)}
          style={{ fontSize: 11.5, color: "oklch(0.6 0.034 250)", cursor: "pointer", textAlign: "center" }}
        >
          {partage ? "I own this journal" : "I have a shared account"}
        </div>
      </form>
    </div>
  );
}
