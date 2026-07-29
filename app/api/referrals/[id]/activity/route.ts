import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, ownedReferral } from "@/lib/account";

// Agent-only (protected by middleware): the immutable activity timeline for a referral.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { data, error } = await db()
    .from("activity_log")
    .select("id, event_type, detail, actor, created_at")
    .eq("referral_id", params.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data ?? [] });
}
