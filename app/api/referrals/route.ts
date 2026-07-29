import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { normalizePhone, normalizeEmail } from "@/lib/format";
import { getAccount } from "@/lib/account";

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await db()
    .from("referrals")
    .select("*, partners(name), documents(id, kind, file_name, uploaded_by)")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ referrals: data });
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.client_name || !body?.partner_id) {
    return NextResponse.json({ error: "client_name and partner_id are required" }, { status: 400 });
  }
  // The chosen partner must belong to this account.
  const { data: partnerOwned } = await db()
    .from("partners")
    .select("id")
    .eq("id", body.partner_id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partnerOwned) return NextResponse.json({ error: "partner not found" }, { status: 404 });

  const row = {
    account_id: account.id,
    partner_id: body.partner_id,
    client_name: String(body.client_name).trim(),
    client_phone: normalizePhone(body.client_phone),
    client_email: normalizeEmail(body.client_email),
    closing_date: body.closing_date || null,
    notes: body.notes || null,
    source: "agent",
    log_seconds: typeof body.log_seconds === "number" ? body.log_seconds : null,
  };
  const { data, error } = await db().from("referrals").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from("status_events").insert({ referral_id: data.id, status: "new" });
  await logActivity(data.id, "lead_logged", `Lead logged for ${data.client_name}`, "agent");
  return NextResponse.json({ referral: data });
}
