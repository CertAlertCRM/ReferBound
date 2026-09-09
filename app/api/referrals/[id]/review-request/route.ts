import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, visibleReferral } from "@/lib/account";
import { agentProfile } from "@/lib/profile";
import { sendEmail, reviewRequestEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

// One-tap Google review request to the CLIENT, sent at the happiest moment —
// right after their policy is bound. Uses the agent's own Google review link
// (agent_profile.google_review_url). One send per referral unless resent.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const referral = await visibleReferral(account, params.id, "id, client_name, client_email, status");
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!referral.client_email) {
    return NextResponse.json({ error: "This client has no email on file — add one first." }, { status: 400 });
  }

  // The review link stays the agency's — a producer must not be able to point
  // it somewhere else — but the ask comes from them by name.
  const prof = await agentProfile(account);
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

  const agentName = prof?.display_name || "your agent";
  const result = await sendEmail({
    referralId: referral.id,
    kind: "review_request",
    to: [referral.client_email],
    subject: `Quick favor? A review for ${prof?.agency_name || agentName}`,
    html: reviewRequestEmail(referral.client_name, agentName, prof?.agency_name ?? null, reviewUrl),
  });
  if (!result.sent) {
    // Never log a "sent" that didn't happen — and tell the agent the truth.
    return NextResponse.json(
      { error: `The email didn't go through (${result.error ?? "unknown error"}). Check the client's email address.` },
      { status: 502 }
    );
  }
  await logActivity(referral.id, "email_sent", `Google review request sent to ${referral.client_name}`, "agent");

  return NextResponse.json({ ok: true });
}
