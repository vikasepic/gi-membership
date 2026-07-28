import type { MetadataRoute } from "next";

// Makes the store installable: "Add to Home Screen" gives a real icon and opens
// standalone, with no browser chrome. Without this it can only ever be a tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Greater Inside",
    short_name: "Greater Inside",
    description: "Your courses, library and Content Engine — Greater Inside.",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0D",
    theme_color: "#0B0B0D",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
