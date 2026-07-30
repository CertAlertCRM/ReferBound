import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { createSessionToken, verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Founder support view ("View as"): swap the session to an agent's account to
// see exactly what they see, with a signed return ticket back to the admin
// session. Everything is time-boxed to 2 hours and clearly bannered in the UI.
//
// POST { email }  → become that account (sets rb_session to them,
//                   rb_admin_return to the admin, rb_support_view for the banner)
// DELETE          → return to the admin account, clear support cookies

const RETURN_COOKIE = "rb_admin_return";
const VIEW_COOKIE = "rb_support_view"; // display-only (banner); not httpOnly
const TWO_HOURS = 60 * 60 * 2;

function isAdminEmail(email: string): boolean {
  const admin = (process.env.ADMIN_EMAIL || process.env.AGENT_EMAIL || "").toLowerCase();
  return admin.length > 0 && email.toLowerCase() === admin;
}

function cookieBase(httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_HOURS,
  };
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account || !isAdminEmail(account.email)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (isAdminEmail(email)) {
    return NextResponse.json({ error: "that's already you" }, { status: 400 });
  }

  const { data: target } = await db()
    .from("accounts")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "no account with that email" }, { status: 404 });

  const res = NextResponse.json({ ok: true, viewing: target.email });
  // Become the agent…
  res.cookies.set({ name: SESSION_COOKIE, value: createSessionToken(target.id), ...cookieBase(true) });
  // …with a signed ticket back to the admin session…
  res.cookies.set({ name: RETURN_COOKIE, value: createSessionToken(account.selfId), ...cookieBase(true) });
  // …and a visible marker the banner reads (no secrets in it).
  res.cookies.set({ name: VIEW_COOKIE, value: target.email, ...cookieBase(false) });
  return res;
}

export async function DELETE(req: NextRequest) {
  const adminId = verifySessionToken(req.cookies.get(RETURN_COOKIE)?.value);
  if (!adminId) return NextResponse.json({ error: "no support session to exit" }, { status: 400 });

  // The return ticket must actually belong to the founder account.
  const { data: admin } = await db().from("accounts").select("id, email").eq("id", adminId).maybeSingle();
  if (!admin || !isAdminEmail(admin.email)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: createSessionToken(admin.id), ...cookieBase(true), maxAge: 60 * 60 * 24 * 90 });
  res.cookies.set({ name: RETURN_COOKIE, value: "", ...cookieBase(true), maxAge: 0 });
  res.cookies.set({ name: VIEW_COOKIE, value: "", ...cookieBase(false), maxAge: 0 });
  return res;
}
