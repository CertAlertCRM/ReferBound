import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EMAIL_RE } from "@/lib/format";
import { PARTNER_TYPES } from "@/lib/config";
import { getAccount } from "@/lib/account";

// Agent-only (protected by middleware): edit a partner's name / notification emails.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    patch.name = name;
  }
  if ("emails" in body) {
    patch.emails = String(body.emails ?? "")
      .split(/[,;\s]+/)
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => EMAIL_RE.test(e));
  }
  if ("partner_type" in body && PARTNER_TYPES[body.partner_type]) {
    patch.partner_type = body.partner_type;
    // Custom label rides only with "Other"; switching to a built-in type clears it.
    patch.type_label =
      body.partner_type === "other"
        ? String(body.type_label ?? "").trim().slice(0, 40) || null
        : null;
  }
  if ("monthly_summary" in body) {
    patch.monthly_summary = Boolean(body.monthly_summary);
  }
  // What this lender requires — entered once, checked against every EOI.
  if ("requirements" in body) {
    const r = body.requirements ?? {};
    const clean = {
      mortgagee_clause: String(r.mortgagee_clause ?? "").trim().slice(0, 500) || null,
      max_wind_deductible: String(r.max_wind_deductible ?? "").trim().slice(0, 60) || null,
      min_liability: String(r.min_liability ?? "").trim().slice(0, 60) || null,
      flood_required: Boolean(r.flood_required),
      notes: String(r.notes ?? "").trim().slice(0, 500) || null,
    };
    const empty =
      !clean.mortgagee_clause && !clean.max_wind_deductible && !clean.min_liability && !clean.flood_required && !clean.notes;
    patch.requirements = empty ? null : clean;
  }
  if ("thankyou_cadence" in body) {
    const cadence = String(body.thankyou_cadence ?? "off");
    if (!["off", "monthly", "quarterly"].includes(cadence)) {
      return NextResponse.json({ error: "invalid cadence" }, { status: 400 });
    }
    patch.thankyou_cadence = cadence;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("partners")
    .update(patch)
    .eq("id", params.id)
    .eq("account_id", account.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}

// Delete a partner. Their magic link dies immediately and every referral they
// sent cascades away with them (FK on delete cascade) — the UI double-confirms
// with the referral count before calling this.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await db()
    .from("partners")
    .delete()
    .eq("id", params.id)
    .eq("account_id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
