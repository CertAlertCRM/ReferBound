import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// Which mortgagee clause belongs on this file.
//
// The processor is the authority here — they're the one who knows the file was
// sold to a different investor than the last four. When they set it, it's
// marked as theirs and nothing overwrites it afterwards, including the matcher.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  const { data: partner } = await db()
    .from("partners")
    .select("id, name")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const referralId = String(body?.referral_id ?? "");
  const clauseId = body?.clause_id ? String(body.clause_id) : null;
  if (!referralId) return NextResponse.json({ error: "referral_id required" }, { status: 400 });

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name")
    .eq("id", referralId)
    .eq("partner_id", partner.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  let label: string | null = null;
  if (clauseId) {
    const { data: clause } = await db()
      .from("mortgagee_clauses")
      .select("id, label")
      .eq("id", clauseId)
      .eq("partner_id", partner.id)
      .maybeSingle();
    if (!clause) return NextResponse.json({ error: "unknown clause" }, { status: 400 });
    label = clause.label;
  }

  await db()
    .from("referrals")
    .update({ mortgagee_clause_id: clauseId, clause_source: clauseId ? "processor" : null })
    .eq("id", referral.id);

  await logActivity(
    referral.id,
    "note",
    clauseId
      ? `${partner.name} set the mortgagee clause for this file: ${label}`
      : `${partner.name} cleared the mortgagee clause on this file`,
    "partner"
  );

  return NextResponse.json({ ok: true, label });
}
