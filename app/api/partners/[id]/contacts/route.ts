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
    .select("id, name, email, role, created_at")
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
  if (!name || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("partner_contacts")
    .insert({ partner_id: params.id, name, email, role })
    .select("id, name, email, role")
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
