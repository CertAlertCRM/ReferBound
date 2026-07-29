import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { sendEmail, feedbackEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Product feedback from agents AND partners, straight to the founder's inbox.
// Public route (partners aren't signed in) — no data is stored beyond the
// email log; the message just gets delivered.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim().slice(0, 3000);
  if (message.length < 3) {
    return NextResponse.json({ error: "Tell us a little more first" }, { status: 400 });
  }

  const source = body?.source === "partner" ? "partner portal" : "agent app";
  const context = String(body?.context ?? "").trim().slice(0, 200);

  // Identify the sender as well as we can without asking for anything.
  let fromLabel = context ? `From: ${context}` : "From: anonymous";
  const account = await getAccount().catch(() => null);
  if (account) {
    fromLabel = `From: ${account.email} (${account.plan} plan)${context ? ` · ${context}` : ""}`;
  }

  const to = process.env.FEEDBACK_EMAIL || process.env.AGENT_EMAIL;
  if (!to) return NextResponse.json({ error: "feedback inbox not configured" }, { status: 500 });

  const result = await sendEmail({
    kind: "feedback",
    to: [to],
    subject: `ReferBound feedback (${source})`,
    html: feedbackEmail(source, fromLabel, message),
  });
  if (!result.sent) {
    return NextResponse.json({ error: "Couldn't send right now — try again in a minute" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
