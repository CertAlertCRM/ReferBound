import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { sendSms, toE164 } from "@/lib/sms";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// Agent-initiated, one-off: text a partner contact their portal magic link.
// Uses the short code so the SMS reads clean. Requires a valid mobile on the
// contact; every text carries STOP language, and Twilio's opt-out handling
// blocks the number permanently if they reply STOP.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const contactId = String(body?.contactId ?? "");
  const rawPhone = String(body?.phone ?? "").trim();
  if (!contactId && !rawPhone) {
    return NextResponse.json({ error: "contactId or phone required" }, { status: 400 });
  }

  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token, short_code")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Either a saved contact's mobile, or a one-off number the agent just typed.
  let phone: string | null = null;
  let firstName: string | null = null;
  if (contactId) {
    const { data: contact } = await db()
      .from("partner_contacts")
      .select("id, name, phone")
      .eq("id", contactId)
      .eq("partner_id", partner.id)
      .maybeSingle();
    if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
    phone = contact.phone;
    firstName = String(contact.name).split(" ")[0];
  } else {
    phone = rawPhone;
  }
  if (!toE164(phone)) {
    return NextResponse.json({ error: "That's not a valid US mobile number" }, { status: 400 });
  }

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name")
    .eq("account_id", account.id)
    .maybeSingle();
  const agentName = prof?.display_name || "Your insurance agent";

  const url = `${appUrl()}/p/${partner.short_code ?? partner.token}`;
  const hi = `Hi${firstName ? ` ${firstName}` : ""}`;
  // Two asks: introduce the portal, or invite them to load their active files
  // so the board reflects everything in flight from day one.
  const backfill = String(body?.purpose ?? "") === "backfill";
  const message = backfill
    ? `${hi} — ${agentName} here. Whenever you get a minute, add the files you have working right now to your portal so we're both looking at the same board: ${url} — takes about a minute each. Reply STOP to opt out.`
    : `${hi} — ${agentName} here. Your live referral portal for ${partner.name} is ready: ${url} — see every client you've sent and grab insurance docs anytime. Reply STOP to opt out.`;

  const { sent, error } = await sendSms({
    kind: backfill ? "portal_backfill" : "portal_link",
    to: phone,
    body: message,
  });
  if (!sent) return NextResponse.json({ error: error ?? "text failed" }, { status: 502 });

  return NextResponse.json({ ok: true });
}
