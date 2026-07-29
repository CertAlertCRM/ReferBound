import type { MetadataRoute } from "next";

// PWA manifest — makes ReferBound installable as an app from the browser
// (Add to Home Screen on iOS, Install on Android/desktop Chrome). No service
// worker on purpose: we want every load fresh from the network — stale-cache
// bugs cost us dearly once already.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReferBound — Live referral tracking",
    short_name: "ReferBound",
    description: "Live referral tracking between insurance agents and their partners.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2547eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
