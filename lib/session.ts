import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Account sessions: HMAC-signed tokens in an httpOnly cookie.
// Token format: <accountId>.<expiresMs>.<hexSig>
// The middleware verifies the same HMAC with Web Crypto (edge-safe).

export const SESSION_COOKIE = "rb_session";
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.SESSION_SECRET || process.env.AGENT_PASSCODE || "";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(accountId: string): string {
  const payload = `${accountId}.${Date.now() + NINETY_DAYS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token || !secret()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [accountId, exp, sig] = parts;
  const payload = `${accountId}.${exp}`;
  if (sign(payload) !== sig) return null;
  if (Number(exp) < Date.now()) return null;
  return accountId;
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  };
}

// Server-side (route handlers / server components): the signed-in account id.
export function currentAccountId(): string | null {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}
