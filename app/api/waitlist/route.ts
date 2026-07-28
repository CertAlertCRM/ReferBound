import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public: early-access waitlist signup from the landing page.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const { error } = await db()
    .from("waitlist")
    .upsert({ email, source: String(body?.source ?? "landing").slice(0, 40) }, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
