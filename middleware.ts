import { NextRequest, NextResponse } from "next/server";

// Protects agent pages. Partner portal (/p/*), login, cron, and doc downloads
// (which carry their own token checks) are public.
// Edge-safe: uses Web Crypto to recompute the expected session cookie value,
// SHA-256("agent-session-v1:" + AGENT_PASSCODE) — must match lib/auth.ts.

const PUBLIC_PREFIXES = [
  "/login",
  "/p/",
  "/api/login",
  "/api/p/",
  "/api/cron/",
  "/api/docs/",
  "/_next",
  "/favicon.ico",
];

async function expectedToken(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`agent-session-v1:${passcode}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const passcode = process.env.AGENT_PASSCODE || "";
  const cookie = req.cookies.get("rl_agent")?.value;
  if (!passcode || !cookie || cookie !== (await expectedToken(passcode))) {
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
