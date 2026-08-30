"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes an open menu on a click outside it, or on Escape.
 *
 * Not on the pointer leaving, which is how these menus used to close: the panel
 * hangs a few pixels below its button, so sliding the mouse down to reach it
 * crosses ground that belongs to neither, and the list vanished mid-reach. A
 * menu should stay until it is dismissed, not until the mouse wanders.
 */
export function useMenuDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  // Held in a ref so a new closure on every render does not tear the listeners
  // down and set them up again.
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });

  useEffect(() => {
    if (!open) return;

    // pointerdown rather than click: a press that starts on the list and ends
    // off it — selecting text in the search field, say — is not a dismissal.
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) latest.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}
