import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSessionToken, sessionCookie } from "@/lib/session";
import { normalizeEmail } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const { data: account } = await db()
    .from("accounts")
    .select("id, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (!account || !verifyPassword(password, account.password_hash)) {
    return NextResponse.json({ error: "Email or password didn't match" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(createSessionToken(account.id)));
  return res;
}
