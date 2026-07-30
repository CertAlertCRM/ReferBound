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
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token, short_code")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: contact } = await db()
    .from("partner_contacts")
    .select("id, name, phone")
    .eq("id", contactId)
    .eq("partner_id", partner.id)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
  if (!toE164(contact.phone)) {
    return NextResponse.json({ error: "This contact doesn't have a valid mobile number yet" }, { status: 400 });
  }

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name")
    .eq("account_id", account.id)
    .maybeSingle();
  const agentName = prof?.display_name || "Your insurance agent";

  const url = `${appUrl()}/p/${partner.short_code ?? partner.token}`;
  const firstName = String(contact.name).split(" ")[0];
  const { sent, error } = await sendSms({
    kind: "portal_link",
    to: contact.phone,
    body: `Hi ${firstName} — ${agentName} here. Your live referral portal for ${partner.name} is ready: ${url} — see every client you've sent and grab insurance docs anytime. Reply STOP to opt out.`,
  });
  if (!sent) return NextResponse.json({ error: error ?? "text failed" }, { status: 502 });

  return NextResponse.json({ ok: true, to: contact.name });
}
