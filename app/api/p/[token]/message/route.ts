import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, messageEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/helpers";

// Public (token-guarded): partner sends a message on one of their referrals.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, account_id")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const referralId = String(body?.referral_id ?? "");
  const text = String(body?.body ?? "").trim().slice(0, 2000);
  if (!referralId || !text) {
    return NextResponse.json({ error: "referral_id and body are required" }, { status: 400 });
  }

  // The referral must belong to this partner — a token only speaks for its own deals.
  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, partner_id")
    .eq("id", referralId)
    .eq("partner_id", partner.id)
    .single();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await db()
    .from("messages")
    .insert({ referral_id: referral.id, sender: "partner", body: text });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(referral.id, "email_sent", `Message from ${partner.name}: “${text.slice(0, 120)}”`, "partner");

  const { data: ownerAccount } = await db()
    .from("accounts")
    .select("email")
    .eq("id", (partner as any).account_id)
    .maybeSingle();
  const agentEmail = ownerAccount?.email || process.env.AGENT_EMAIL;
  await sendEmail({
    referralId: referral.id,
    kind: "message",
    to: agentEmail ? [agentEmail] : [],
    subject: `${partner.name} asked about ${referral.client_name}`,
    html: messageEmail(
      partner.name,
      referral.client_name,
      text,
      `${appUrl()}/deal/${referral.id}`,
      "Reply from the deal page"
    ),
  });

  return NextResponse.json({ ok: true });
}
