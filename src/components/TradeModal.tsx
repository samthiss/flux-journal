"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Full-width overlay for a trade's detail, opened over the trades list via
 * the (.)trades/[id] intercepted route. Clicking the backdrop — anywhere
 * outside the panel — closes it back to the list; clicking inside the panel
 * must not bubble up into that same handler.
 *
 * router.back() rather than a Link to /trades: it keeps forward/back
 * navigation and a direct link to /trades/[id] (no @modal match) both
 * working the way the Next.js intercepting-routes convention expects.
 */
export default function TradeModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "oklch(0.08 0.017 250 / 0.72)",
        display: "flex",
        justifyContent: "center",
        padding: "40px 48px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 1400,
          height: "fit-content",
          background: "oklch(0.13 0.0255 250)",
          border: "1px solid oklch(0.3 0.051 250 / 0.6)",
          borderRadius: 20,
          padding: "36px 40px",
          boxShadow: "0 30px 80px oklch(0 0 0 / 0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
