import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { THEMES } from "@/lib/themes";

export const dynamic = "force-dynamic";

// Per-portal PWA manifest. Each partner portal installs as its OWN app —
// named after the partnership, themed in the agent's brand color, and opening
// straight to /p/<token> instead of the agent login. Public route: install
// prompts fetch this with no cookies.

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, account_id")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: prof } = await db()
    .from("agent_profile")
    .select("agency_name, display_name, brand_color")
    .eq("account_id", partner.account_id)
    .maybeSingle();
  const agency = prof?.agency_name || prof?.display_name || "ReferBound";
  const theme = THEMES[prof?.brand_color ?? ""] ?? THEMES.default;

  const manifest = {
    name: `${partner.name} × ${agency} — referrals`,
    short_name: partner.name.slice(0, 24),
    description: `Live referral tracking with ${agency}.`,
    id: `/p/${slug}`,
    start_url: `/p/${slug}`,
    scope: `/p/${slug}`,
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: theme.swatch,
    icons: [
      { src: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icon-96.png", sizes: "96x96", type: "image/png" },
      { src: "/icon-144.png", sizes: "144x144", type: "image/png" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-256.png", sizes: "256x256", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
