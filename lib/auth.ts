import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

// Minimal agent auth for the pilot: one passcode (env AGENT_PASSCODE),
// exchanged for an httpOnly cookie whose value is SHA-256("agent-session-v1:" + passcode).
// The middleware recomputes the same digest with Web Crypto (edge-safe).

const COOKIE_NAME = "rl_agent";

function secret(): string {
  return process.env.AGENT_PASSCODE || "";
}

export function sessionToken(): string {
  return createHash("sha256").update(`agent-session-v1:${secret()}`).digest("hex");
}

export function checkPasscode(passcode: string): boolean {
  const s = secret();
  if (!s) return false;
  const a = Buffer.from(passcode);
  const b = Buffer.from(s);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAgentAuthed(): boolean {
  if (!secret()) return false;
  const c = cookies().get(COOKIE_NAME);
  return !!c && c.value === sessionToken();
}

export function agentCookie() {
  return {
    name: COOKIE_NAME,
    value: sessionToken(),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  };
}
