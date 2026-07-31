import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, partnerLimit } from "@/lib/account";
import { concentration, PROSPECT_STATUSES } from "@/lib/radar";
import { PARTNER_TYPES } from "@/lib/config";

export const dynamic = "force-dynamic";

// Referral Radar: the agent's own numbers (where their referrals actually come
// from) plus the partner pipeline — people found on their documents and
// prospects they're working.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: partners }, { data: refs }, { data: prospects }] = await Promise.all([
    db().from("partners").select("id, name").eq("account_id", account.id),
    db().from("referrals").select("partner_id").eq("account_id", account.id),
    db()
      .from("partner_prospects")
      .select(
        "id, name, company, email, phone, nmls, partner_type, source, status, notes, deal_count, converted_partner_id, suggested_partner_id, partners:suggested_partner_id(name)"
      )
      .eq("account_id", account.id)
      .is("dismissed_at", null)
      .is("converted_partner_id", null)
      .order("deal_count", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const names = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const conc = concentration(refs ?? [], names);

  return NextResponse.json({
    partnerCount: partners?.length ?? 0,
    limit: partnerLimit(account.plan),
    plan: account.plan,
    ...conc,
    prospects: (prospects ?? []).map((p: any) => ({
      ...p,
      suggestedPartnerName: p.partners?.name ?? null,
    })),
    statuses: PROSPECT_STATUSES,
  });
}

// Add a prospect the agent met out in the world.
export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim() || null;
  const company = String(body?.company ?? "").trim() || null;
  if (!name && !company) return NextResponse.json({ error: "name or company required" }, { status: 400 });

  const { data, error } = await db()
    .from("partner_prospects")
    .insert({
      account_id: account.id,
      name,
      company,
      email: String(body?.email ?? "").trim() || null,
      phone: String(body?.phone ?? "").trim() || null,
      partner_type: PARTNER_TYPES[body?.partner_type] ? body.partner_type : "lender",
      notes: String(body?.notes ?? "").trim() || null,
      source: "manual",
      status: "idea",
    })
    .select("id, name, company, email, phone, nmls, partner_type, source, status, notes, deal_count")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

// Move a prospect along the pipeline, or edit their details.
export async function PATCH(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("status" in body) {
    const s = String(body.status);
    if (!PROSPECT_STATUSES[s]) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    patch.status = s;
  }
  for (const f of ["name", "company", "email", "phone", "notes"]) {
    if (f in body) patch[f] = String(body[f] ?? "").trim() || null;
  }
  if ("partner_type" in body && PARTNER_TYPES[body.partner_type]) patch.partner_type = body.partner_type;

  const { data, error } = await db()
    .from("partner_prospects")
    .update(patch)
    .eq("id", id)
    .eq("account_id", account.id)
    .select("id, name, company, email, phone, nmls, partner_type, source, status, notes, deal_count")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

// Dismiss: hide a suggestion without deleting the history behind it.
export async function DELETE(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db()
    .from("partner_prospects")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
