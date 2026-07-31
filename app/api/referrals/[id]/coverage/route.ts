import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, ownedReferral } from "@/lib/account";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// The E&O defense record almost no agent keeps: what you recommended, and what
// the client did about it, with a timestamp. When a claim lands years later,
// "I offered flood and they declined on 3/12" is the difference between a
// defensible file and a bad afternoon.

const OUTCOMES: Record<string, string> = {
  declined: "Declined by client",
  accepted: "Accepted",
  pending: "Recommended — awaiting decision",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const coverage = String(body?.coverage ?? "").trim().slice(0, 120);
  const outcome = OUTCOMES[String(body?.outcome)] ? String(body.outcome) : "declined";
  const note = String(body?.note ?? "").trim().slice(0, 500) || null;
  if (!coverage) return NextResponse.json({ error: "coverage is required" }, { status: 400 });

  const { data: referral } = await db()
    .from("referrals")
    .select("coverage_notes")
    .eq("id", params.id)
    .single();

  const entries = Array.isArray(referral?.coverage_notes) ? referral!.coverage_notes : [];
  const entry = { coverage, outcome, note, at: new Date().toISOString() };
  const next = [...entries, entry].slice(-40);

  const { error } = await db().from("referrals").update({ coverage_notes: next }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also written to the immutable timeline, so the record exists in two places.
  await logActivity(
    params.id,
    "status_changed",
    `Coverage record: ${coverage} — ${OUTCOMES[outcome]}${note ? ` (${note})` : ""}`,
    "agent"
  );

  return NextResponse.json({ entries: next });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const at = req.nextUrl.searchParams.get("at");
  const { data: referral } = await db()
    .from("referrals")
    .select("coverage_notes")
    .eq("id", params.id)
    .single();
  const entries = Array.isArray(referral?.coverage_notes) ? referral!.coverage_notes : [];
  const next = entries.filter((e: any) => e.at !== at);
  await db().from("referrals").update({ coverage_notes: next }).eq("id", params.id);
  return NextResponse.json({ entries: next });
}
