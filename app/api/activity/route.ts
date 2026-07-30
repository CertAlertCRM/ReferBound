import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

// Account-wide activity feed — the most recent touches across ALL referrals,
// for the dashboard's desktop rail. Each entry carries its client name so the
// feed reads like a story: who moved, what happened, when.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db()
    .from("activity_log")
    .select("id, referral_id, event_type, detail, actor, created_at, referrals!inner(account_id, client_name)")
    .eq("referrals.account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(16);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    activity: (data ?? []).map((a: any) => ({
      id: a.id,
      referral_id: a.referral_id,
      event_type: a.event_type,
      detail: a.detail,
      actor: a.actor,
      created_at: a.created_at,
      client_name: a.referrals?.client_name ?? null,
    })),
  });
}
