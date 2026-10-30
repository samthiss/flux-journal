"use client";

import { useActionState } from "react";
import { accentColor } from "@/lib/theme";
import { signUp } from "../login/actions";

const champ = {
  padding: "10px 12px",
  borderRadius: 9,
  border: "1px solid oklch(0.34 0.034 250)",
  background: "oklch(0.16 0.0306 250)",
  color: "oklch(0.92 0 0)",
  fontSize: 13,
  outline: "none",
} as const;

export default function SignUpForm({ code }: { code: string }) {
  const [error, formAction, pending] = useActionState(signUp, null);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
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
        <div style={{ fontSize: 12, color: "oklch(0.62 0.034 250)", lineHeight: 1.5 }}>
          {/* Said plainly, because it decides what the person expects to find
              on the other side of the button: their own empty journal, not
              the journal of whoever invited them. */}
          Your own journal: your trades, your dashboard, and your own links to share it. It starts
          empty — nobody else&apos;s trades are in it.
        </div>

        <input type="hidden" name="code" value={code} />
        <input name="email" type="email" autoFocus autoComplete="email" placeholder="Email address" style={champ} />
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Password (at least 8 characters)"
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
          {pending ? "…" : "Create account"}
        </button>

        {error && <div style={{ fontSize: 12, color: "oklch(0.7 0.25 18)" }}>{error}</div>}
      </form>
    </div>
  );
}
