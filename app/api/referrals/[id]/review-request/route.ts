import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, ownedReferral } from "@/lib/account";
import { sendEmail, reviewRequestEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import { APP_CONFIG } from "@/lib/config";

// One-tap Google review request to the CLIENT, sent at the happiest moment —
// right after their policy is bound. Uses the agent's own Google review link
// (agent_profile.google_review_url). One send per referral unless resent.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const referral = await ownedReferral(account.id, params.id, "id, client_name, client_email, status");
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!referral.client_email) {
    return NextResponse.json({ error: "This client has no email on file — add one first." }, { status: 400 });
  }

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name, google_review_url")
    .eq("account_id", account.id)
    .maybeSingle();
  const reviewUrl = prof?.google_review_url?.trim();
  if (!reviewUrl) {
    return NextResponse.json(
      { error: "Add your Google review link on the Profile page first (Google Business Profile → Ask for reviews)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));

  // One per referral unless explicitly resent.
  const { data: prior } = await db()
    .from("email_log")
    .select("id")
    .eq("kind", "review_request")
    .eq("referral_id", referral.id)
    .eq("sent", true)
    .limit(1);
  if (prior && prior.length > 0 && !body?.resend) {
    return NextResponse.json({ ok: true, already: true });
  }

  const agentName = prof?.display_name || APP_CONFIG.agentName;
  await sendEmail({
    referralId: referral.id,
    kind: "review_request",
    to: [referral.client_email],
    subject: `Quick favor? A review for ${prof?.agency_name || agentName}`,
    html: reviewRequestEmail(referral.client_name, agentName, prof?.agency_name ?? null, reviewUrl),
  });
  await logActivity(referral.id, "email_sent", `Google review request sent to ${referral.client_name}`, "agent");

  return NextResponse.json({ ok: true });
}
