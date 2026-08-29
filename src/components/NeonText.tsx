"use client";

import { useEffect, useRef, useState } from "react";
import { pageTitle } from "@/lib/theme";

const GLYPHS = "▚▓█▞01<>/\\_#$%&*+=";

/** Eased so both effects below land softly instead of stopping dead. */
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Runs `frame` on every repaint for `duration` ms, with progress from 0 to 1,
 * and calls it one last time at exactly 1 so nothing settles a pixel short.
 *
 * Returns nothing and takes the callback in a ref, so a parent re-rendering
 * mid-animation cannot restart it — which is what made the dashboard counters
 * jump back to zero every time a filter changed.
 */
function useAnimationFrames(duration: number, key: string, frame: (progress: number) => void) {
  const latest = useRef(frame);
  // Kept up to date in an effect rather than during render, so a re-render
  // never writes to the ref while React is still building the tree.
  useEffect(() => {
    latest.current = frame;
  });

  useEffect(() => {
    // Honour the same preference the CSS entrances do: land on the final value
    // immediately rather than animating towards it.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      latest.current(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      latest.current(progress);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [duration, key]);
}

/**
 * A number that counts up to its value.
 *
 * The count restarts whenever the value itself changes — changing the period on
 * the dashboard re-runs it — but not when the parent merely re-renders.
 */
export function CountUp({
  value,
  format,
  duration = 700,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  useAnimationFrames(duration, String(value), (p) => setShown(value * easeOut(p)));
  return <>{format(shown)}</>;
}

/**
 * Text that resolves out of noise, one character at a time from the left.
 *
 * Spaces are left alone: scrambling them makes a title look like one long word
 * until it settles, which reads as broken rather than as decoding.
 */
export function DecodeText({ text, duration = 550 }: { text: string; duration?: number }) {
  const [shown, setShown] = useState(text);
  useAnimationFrames(duration, text, (p) => {
    const settled = Math.floor(easeOut(p) * text.length);
    setShown(
      text
        .split("")
        .map((c, i) => (i < settled || c === " " ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
        .join("")
    );
  });
  return <>{shown}</>;
}

/** The heading every page opens with, decoding into place. */
export function PageTitle({ children }: { children: string }) {
  return (
    <div style={pageTitle}>
      <DecodeText text={children} />
    </div>
  );
}
