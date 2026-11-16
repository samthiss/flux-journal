import type { MetadataRoute } from "next";

/** What lets the journal be added to a phone's home screen — needed on iPhone for its notifications. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flux Journal",
    short_name: "Journal",
    start_url: "/checklist",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
