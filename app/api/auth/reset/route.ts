import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/session";
import { normalizeEmail } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code ?? "").trim();
  const password = String(body?.password ?? "");
  if (!email || !code) return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: rc } = await db()
    .from("reset_codes")
    .select("id, expires_at, used")
    .eq("email", email)
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rc || rc.used || new Date(rc.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "That code isn't valid — request a new one" }, { status: 400 });
  }

  await db().from("reset_codes").update({ used: true }).eq("id", rc.id);
  const { error } = await db()
    .from("accounts")
    .update({ password_hash: hashPassword(password) })
    .eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
