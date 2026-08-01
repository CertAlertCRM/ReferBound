import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { sendEmail, plainBodyEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// Telling a partner a deal didn't happen.
//
// Deliberately never automatic, and deliberately not the default. Most of the
// time the client simply stops answering and the loan officer already has an
// EOI from someone else — the deal dies quietly and that's fine. Sending a
// notice on every lost file would turn a normal outcome into a small
// announcement of failure, dozens of times a year.
//
// But sometimes they ask, and the agent has an answer. That's what this is:
// one button, a draft the agent edits, sent only when they choose to.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim();

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, status, partners(name, emails), partner_contacts(name, email)")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Draft mode: hand back suggested wording, send nothing.
  if (!message) {
    const contact = (referral as any).partner_contacts;
    const first = contact?.name ? String(contact.name).split(" ")[0] : "";
    const { data: prof } = await db()
      .from("agent_profile")
      .select("display_name")
      .eq("account_id", account.id)
      .maybeSingle();
    return NextResponse.json({
      draft:
        `${first ? `${first} — ` : ""}wanted to close the loop on ${referral.client_name}. ` +
        `We weren't able to get them written this time.\n\n` +
        `Nothing on your end — just didn't want to leave you wondering. ` +
        `Send the next one my way and I'll take good care of them.\n\n` +
        `${prof?.display_name ?? ""}`,
    });
  }

  const contact = (referral as any).partner_contacts;
  const to: string[] = contact?.email ? [contact.email] : ((referral as any).partners?.emails ?? []);
  if (to.length === 0) {
    return NextResponse.json({ error: "No email on file for this partner" }, { status: 400 });
  }

  const result = await sendEmail({
    referralId: referral.id,
    kind: "status_update",
    to,
    subject: `${referral.client_name} — closing the loop`,
    html: plainBodyEmail(message.slice(0, 4000)),
  });
  if (!result.sent) {
    return NextResponse.json({ error: `Couldn't send (${result.error ?? "unknown"})` }, { status: 502 });
  }

  await logActivity(
    referral.id,
    "email_sent",
    `Let ${(referral as any).partners?.name ?? "the partner"} know this one didn't get written`,
    "agent"
  );
  return NextResponse.json({ ok: true });
}
