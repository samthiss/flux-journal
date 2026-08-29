"use client";

import { useState } from "react";
import Image from "next/image";
import ImageLightbox from "@/components/ImageLightbox";

/**
 * The chart grid of a trade, laid out the way note examples are.
 *
 * A tile keeps its capture's own proportions — `width: 100%` with
 * `height: auto`, per the responsive recipe in the next/image docs — instead of
 * the fixed 16/10 box that used to crop the sides off every chart wider than
 * that. Clicking one opens it full page.
 *
 * The resize is asked of our own upload route rather than of next/image, for
 * the reason spelled out in src/lib/thumbnails.ts: the built-in optimizer
 * forwards no headers and only ever gets a 401 from behind the session proxy.
 * Charts imported from the old external host know nothing of `?w=`, so those
 * are served untouched.
 */
export default function TradeCharts({ charts }: { charts: { key: string; label: string; src: string | null }[] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        {charts.map((chart) => (
          <div key={chart.key}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.78 0.034 250)", marginBottom: 8 }}>{chart.label}</div>
            {chart.src ? (
              <Image
                src={chart.src}
                alt={chart.label}
                // The zeroes the responsive recipe uses when the dimensions are
                // not known ahead of time — nothing stores them. The style below
                // overrides both.
                width={0}
                height={0}
                unoptimized={!chart.src.startsWith("/")}
                loader={chart.src.startsWith("/") ? ({ src, width }) => `${src}?w=${width}` : undefined}
                sizes="(max-width: 900px) 100vw, 80vw"
                onClick={() => setLightboxUrl(chart.src)}
                title="Cliquer pour voir l'image entière"
                style={{
                  // Full width always, like the note tiles — see the comment
                  // there on why the native-size cap was dropped.
                  width: "100%",
                  height: "auto",
                  // Without this the img sits on the text baseline and leaves a
                  // few stray pixels under every tile.
                  display: "block",
                  borderRadius: 10,
                  border: "1px solid oklch(0.32 0.051 250 / 0.5)",
                  cursor: "zoom-in",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/10",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px dashed oklch(0.36 0.051 250 / 0.6)",
                  borderRadius: 10,
                  color: "oklch(0.5 0.034 250)",
                  fontSize: 12,
                }}
              >
                No image
              </div>
            )}
          </div>
        ))}
      </div>
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );
}
