"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Full-page image overlay. Thumbnails everywhere else are cropped to fit their
 * tile; this is where the whole capture is visible, scaled to the viewport
 * rather than cropped to it.
 *
 * The overlay takes the whole window with no padding, and `contain` sizes the
 * image to whichever edge it meets first: a wide chart capture spans the full
 * window width instead of the ~85% a padded box left it, and nothing is ever
 * cut off. Chart text is small enough that those pixels matter.
 *
 * It renders through a portal on document.body, and has to: `glassCard` carries
 * a `backdrop-filter`, which makes any ancestor of it the containing block for
 * `position: fixed` children. Rendered in place inside a card, `inset: 0` meant
 * the card — several thousand pixels tall once it holds four uncropped charts —
 * so the image sat centred far off screen and the click only showed the dark
 * backdrop. The portal puts the overlay outside every such ancestor.
 *
 * Rendering nothing for a null url keeps the caller down to one piece of state.
 */
export default function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  // The page behind a full-window overlay has no business scrolling.
  useEffect(() => {
    if (!url) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [url]);

  // A url only ever becomes non-null through a click, so the server render and
  // the hydration that follows both take this branch — no mismatch to guard
  // against beyond document itself being absent there.
  if (!url || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "oklch(0.08 0.017 250 / 0.94)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          borderRadius: 8,
          background: "oklch(0.18 0.034 250 / 0.8)",
          color: "oklch(0.9 0.0085 250)",
          cursor: "pointer",
        }}
      >
        ✕
      </div>
    </div>,
    document.body,
  );
}
