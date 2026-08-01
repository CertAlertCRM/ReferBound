import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { normalizePhone, normalizeEmail } from "@/lib/format";
import { getAccount } from "@/lib/account";
import { maybeRewardReferrer } from "@/lib/referral";
import { fireWebhook } from "@/lib/webhook";

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await db()
    .from("referrals")
    .select("*, partners(name, partner_type), partner_contacts(name), documents(id, kind, file_name, uploaded_by, purged_at)")
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
    .select("id, name, partner_type")
    .eq("id", body.partner_id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partnerOwned) return NextResponse.json({ error: "partner not found" }, { status: 404 });

  const row = {
    account_id: account.id,
    partner_id: body.partner_id,
    client_name: String(body.client_name).trim(),
    coborrower_name: String(body.coborrower_name ?? "").trim() || null,
    client_phone: normalizePhone(body.client_phone),
    client_email: normalizeEmail(body.client_email),
    client_dob: body.client_dob || null,
    coborrower_dob: body.coborrower_dob || null,
    property_address: String(body.property_address ?? "").trim() || null,
    closing_date: body.closing_date || null,
    notes: body.notes || null,
    source: "agent",
    log_seconds: typeof body.log_seconds === "number" ? body.log_seconds : null,
  };
  const { data, error } = await db().from("referrals").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from("status_events").insert({ referral_id: data.id, status: "new" });
  await logActivity(data.id, "lead_logged", `Lead logged for ${data.client_name}`, "agent");
  await fireWebhook(account.id, "referral.created", data, partnerOwned);
  // A partner plus a logged lead is real use — whoever referred this agent
  // earns their reward now (idempotent; only ever fires once per pairing).
  await maybeRewardReferrer(account.selfId);
  return NextResponse.json({ referral: data });
}
