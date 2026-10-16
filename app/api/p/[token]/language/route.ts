import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeLocale } from "@/lib/i18n";

// The partner remembering which language they read in.
//
// Public and token-scoped, like every other route under /p/, and the smallest
// possible write: one enum-ish column on the row the token already identifies.
// It cannot be used to read anything back, and the worst a bad actor holding a
// token could do is switch the language of a portal they can already read.
//
// Stripped the same way the portal page strips, so a bookmarked short code
// works here too.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const slug = String(params.token ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 128);
  if (!slug) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const locale = normalizeLocale(body?.locale);

  const { data: partner } = await db()
    .from("partners")
    .select("id")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db().from("partners").update({ locale }).eq("id", partner.id);
  return NextResponse.json({ ok: true, locale });
}
