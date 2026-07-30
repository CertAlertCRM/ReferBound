import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { EMAIL_RE, normalizeEmail } from "@/lib/format";

export const dynamic = "force-dynamic";

// Agent-side management of a partner's team contacts (LOs, processors, …).
// Referral-specific emails route to the contact who sent the lead.

async function ownedPartner(accountId: string, partnerId: string) {
  const { data } = await db()
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("account_id", accountId)
    .maybeSingle();
  return data;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedPartner(account.id, params.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await db()
    .from("partner_contacts")
    .select("id, name, email, role, phone, sms_opt_in, notify_channel, created_at")
    .eq("partner_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedPartner(account.id, params.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = normalizeEmail(body?.email);
  const role = String(body?.role ?? "").trim() || null;
  const phone = String(body?.phone ?? "").trim() || null;
  const sms_opt_in = Boolean(body?.sms_opt_in) && Boolean(phone);
  const notify_channel = CHANNELS.has(String(body?.notify_channel)) ? String(body.notify_channel) : "both";
  if (!name || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("partner_contacts")
    .insert({ partner_id: params.id, name, email, role, phone, sms_opt_in, notify_channel })
    .select("id, name, email, role, phone, sms_opt_in, notify_channel")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

const CHANNELS = new Set(["email", "sms", "both"]);

// Edit an existing contact — add a mobile later, flip SMS consent, or choose
// how they hear about their leads (email / text / both).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedPartner(account.id, params.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const cid = String(body?.cid ?? "");
  if (!cid) return NextResponse.json({ error: "cid required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name can't be empty" }, { status: 400 });
    patch.name = name;
  }
  if ("email" in body) {
    const email = normalizeEmail(body.email);
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid email" }, { status: 400 });
    patch.email = email;
  }
  if ("role" in body) patch.role = String(body.role ?? "").trim() || null;
  if ("phone" in body) patch.phone = String(body.phone ?? "").trim() || null;
  if ("sms_opt_in" in body) patch.sms_opt_in = Boolean(body.sms_opt_in);
  if ("notify_channel" in body) {
    const ch = String(body.notify_channel);
    if (!CHANNELS.has(ch)) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
    patch.notify_channel = ch;
  }
  // Consent can't outlive the number it was given for.
  if ("phone" in patch && !patch.phone) patch.sms_opt_in = false;

  const { data, error } = await db()
    .from("partner_contacts")
    .update(patch)
    .eq("id", cid)
    .eq("partner_id", params.id)
    .select("id, name, email, role, phone, sms_opt_in, notify_channel")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedPartner(account.id, params.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const cid = req.nextUrl.searchParams.get("cid");
  if (!cid) return NextResponse.json({ error: "cid required" }, { status: 400 });
  const { error } = await db().from("partner_contacts").delete().eq("id", cid).eq("partner_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
