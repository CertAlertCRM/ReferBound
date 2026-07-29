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

// Quick-log a touch: the agent taps "Called client" and it lands on the
// timeline — and on the partner's portal, so the lender can see the file is
// being actively worked without asking.
const TOUCH_LABELS: Record<string, string> = {
  call: "Called the client",
  text: "Texted the client",
  email: "Emailed the client",
  voicemail: "Left the client a voicemail",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const type = String(body?.type ?? "");
  const note = String(body?.note ?? "").trim().slice(0, 200);
  if (!TOUCH_LABELS[type] && !note) {
    return NextResponse.json({ error: "type or note required" }, { status: 400 });
  }
  const detail = TOUCH_LABELS[type] ? (note ? `${TOUCH_LABELS[type]} — ${note}` : TOUCH_LABELS[type]) : note;

  const { error } = await db().from("activity_log").insert({
    referral_id: params.id,
    event_type: "touch",
    detail,
    actor: "agent",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
