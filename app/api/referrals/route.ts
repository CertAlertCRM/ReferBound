import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { data, error } = await db()
    .from("referrals")
    .select("*, partners(name), documents(id, kind, file_name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ referrals: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.client_name || !body?.partner_id) {
    return NextResponse.json({ error: "client_name and partner_id are required" }, { status: 400 });
  }
  const row = {
    partner_id: body.partner_id,
    client_name: String(body.client_name).trim(),
    client_phone: body.client_phone || null,
    client_email: body.client_email || null,
    closing_date: body.closing_date || null,
    notes: body.notes || null,
    source: "agent",
    log_seconds: typeof body.log_seconds === "number" ? body.log_seconds : null,
  };
  const { data, error } = await db().from("referrals").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from("status_events").insert({ referral_id: data.id, status: "new" });
  return NextResponse.json({ referral: data });
}
