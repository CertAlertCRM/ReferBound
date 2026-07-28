import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public (token-guarded): save the partner's preferred intro-email template.
// Future AI drafts preserve its structure and voice, swapping client details.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const template = String(body?.template ?? "").trim().slice(0, 5000);
  if (!template) return NextResponse.json({ error: "template is required" }, { status: 400 });

  const { error } = await db().from("partners").update({ intro_template: template }).eq("id", partner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
