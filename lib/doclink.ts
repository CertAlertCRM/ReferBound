import crypto from "crypto";
import { appUrl } from "@/lib/helpers";

// Signed document links for people who have no account and no portal.
//
// A client emailed their proof of insurance can't sign in and must never be
// handed a partner's portal token — that token is the lender's key to their
// whole board. Instead each link carries its own expiring signature, good for
// exactly one document.

function secret(): string {
  return process.env.SESSION_SECRET || process.env.AGENT_PASSCODE || "";
}

export function signDocUrl(docId: string, days = 180): string {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const sig = crypto.createHmac("sha256", secret()).update(`${docId}.${exp}`).digest("base64url");
  return `${appUrl()}/api/docs/${docId}/download?e=${exp}&s=${sig}`;
}

export function verifyDocSig(docId: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || !secret()) return false;
  const n = Number(exp);
  if (!Number.isFinite(n) || n < Date.now() / 1000) return false;
  const expected = crypto.createHmac("sha256", secret()).update(`${docId}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
