import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken, sessionCookie } from "@/lib/session";
import { normalizeEmail, EMAIL_RE } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");
  const displayName = String(body?.display_name ?? "").trim() || null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: existing } = await db().from("accounts").select("id").eq("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists — sign in instead" }, { status: 409 });
  }

  const { data: account, error } = await db()
    .from("accounts")
    .insert({ email, password_hash: hashPassword(password), display_name: displayName })
    .select("id, email")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pilot-data claim: rows created before accounts existed have no owner.
  // The founding agent (AGENT_EMAIL) adopts them on first signup.
  if (process.env.AGENT_EMAIL && email === process.env.AGENT_EMAIL.toLowerCase()) {
    await db().from("partners").update({ account_id: account.id }).is("account_id", null);
    await db().from("referrals").update({ account_id: account.id }).is("account_id", null);
    const { data: legacyProfile } = await db()
      .from("agent_profile")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (legacyProfile) {
      await db()
        .from("agent_profile")
        .update({ account_id: account.id })
        .eq("id", "default")
        .is("account_id", null);
    }
  }

  // Every account gets a profile row keyed by account_id (created lazily if
  // the claim above didn't attach one).
  const { data: prof } = await db()
    .from("agent_profile")
    .select("id")
    .eq("account_id", account.id)
    .maybeSingle();
  if (!prof) {
    await db().from("agent_profile").insert({
      id: account.id,
      account_id: account.id,
      display_name: displayName,
      email,
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(createSessionToken(account.id)));
  return res;
}
