import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, messageEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/helpers";
import { APP_CONFIG } from "@/lib/config";
import { getAccount, ownedReferral } from "@/lib/account";

// Agent-only (protected by middleware): read the thread / reply to the partner.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { data, error } = await db()
    .from("messages")
    .select("id, sender, body, created_at")
    .eq("referral_id", params.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const text = String(body?.body ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, partners(name, token, emails)")
    .eq("id", params.id)
    .single();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await db()
    .from("messages")
    .insert({ referral_id: referral.id, sender: "agent", body: text });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name")
    .eq("account_id", account.id)
    .maybeSingle();
  const agentName = prof?.display_name || APP_CONFIG.agentName;

  await logActivity(referral.id, "email_sent", `Reply from ${agentName}: “${text.slice(0, 120)}”`, "agent");

  const partner = (referral as any).partners;
  await sendEmail({
    referralId: referral.id,
    kind: "message",
    to: partner?.emails ?? [],
    subject: `${agentName} — update on ${referral.client_name}`,
    html: messageEmail(
      agentName,
      referral.client_name,
      text,
      `${appUrl()}/p/${partner?.token}`,
      "View in your referral portal"
    ),
  });

  return NextResponse.json({ ok: true });
}
