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
      // Small sizes matter: the Windows taskbar and Alt-Tab pull 48–144px —
      // without them the installed app shows a generic icon there.
      { src: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icon-96.png", sizes: "96x96", type: "image/png" },
      { src: "/icon-144.png", sizes: "144x144", type: "image/png" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-256.png", sizes: "256x256", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
