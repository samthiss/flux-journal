"use client";

import { useActionState } from "react";
import { accentColor } from "@/lib/theme";
import { signIn } from "./actions";

export default function LoginForm({ from }: { from: string }) {
  const [error, formAction, pending] = useActionState(signIn, null);

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
          FLUX<span style={{ color: accentColor }}>JOURNAL</span>
        </div>

        <input type="hidden" name="from" value={from} />
        <input
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Mot de passe"
          style={{
            padding: "10px 12px",
            borderRadius: 9,
            border: "1px solid oklch(0.34 0.034 250)",
            background: "oklch(0.16 0.0306 250)",
            color: "oklch(0.92 0 0)",
            fontSize: 13,
            outline: "none",
          }}
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
          {pending ? "…" : "Entrer"}
        </button>

        {error && <div style={{ fontSize: 12, color: "oklch(0.7 0.25 18)" }}>{error}</div>}
      </form>
    </div>
  );
}
