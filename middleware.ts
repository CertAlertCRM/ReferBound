import { NextRequest, NextResponse } from "next/server";

// Protects agent pages/APIs with the rb_session cookie (HMAC-signed,
// format: <accountId>.<expiresMs>.<hexSig> — must match lib/session.ts).
// Public: landing, auth pages/APIs, partner portals, crons, doc downloads
// (token-checked in-route), waitlist, and the Stripe webhook.

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot",
  "/welcome",
  "/terms",
  "/privacy",
  "/p/",
  "/hub/",
  "/api/auth/",
  "/api/p/",
  "/api/hub/",
  "/api/feedback",
  "/api/cron/",
  "/api/docs/",
  "/api/waitlist",
  "/api/stripe/",
  "/_next",
  "/favicon.ico",
  "/icon.svg",
  // PWA assets — must load before sign-in for install prompts to work.
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
];

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isValidSession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [accountId, exp, sig] = parts;
  if (Number(exp) < Date.now()) return false;
  return (await hmacHex(`${accountId}.${exp}`, secret)) === sig;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET || process.env.AGENT_PASSCODE || "";
  const authed = await isValidSession(req.cookies.get("rb_session")?.value, secret);

  // Root is dual-purpose: dashboard when signed in, public landing otherwise.
  if (pathname === "/" && !authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/welcome";
    return NextResponse.rewrite(url);
  }

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
