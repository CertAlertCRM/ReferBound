import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { createReferralFromInbound, sendAcknowledgment, makeInboxSlug, inboxAddress } from "@/lib/inbound";
import { finishInboundDocs } from "@/lib/inbound-docs";

export const dynamic = "force-dynamic";

// The review queue behind the forwarding address.
//
// Anything the intake couldn't confidently tie to a known partner waits here
// instead of becoming a lead on its own. Reviewing is meant to take one
// glance: the extracted fields are already filled, the agent picks the partner
// if we couldn't, and one click turns it into a referral.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Mint the address on first look — nothing to configure, it's just there.
  let slug: string | null = null;
  const { data: acct } = await db().from("accounts").select("inbox_slug, display_name").eq("id", account.id).maybeSingle();
  slug = acct?.inbox_slug ?? null;
  if (!slug) {
    for (let attempt = 0; attempt < 5 && !slug; attempt++) {
      const candidate = makeInboxSlug(acct?.display_name);
      const { error } = await db().from("accounts").update({ inbox_slug: candidate }).eq("id", account.id);
      if (!error) slug = candidate;
    }
  }

  const { data, error } = await db()
    .from("inbound_emails")
    .select("id, from_email, from_name, forwarded_from, subject, body, match_kind, extracted, status, referral_id, error, created_at, partners(id, name)")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    address: inboxAddress(slug),
    emails: data ?? [],
  });
}

// Accept a held email as a lead, or dismiss it.
export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = String(body?.action ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: row } = await db()
    .from("inbound_emails")
    .select("*")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "ignore") {
    await db().from("inbound_emails").update({ status: "ignored" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action !== "create") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (row.status === "created") return NextResponse.json({ error: "already logged" }, { status: 400 });

  // The agent can correct anything the extraction got wrong, and must supply
  // the partner when we couldn't match the sender.
  const partnerId = String(body?.partner_id ?? row.partner_id ?? "");
  if (!partnerId) return NextResponse.json({ error: "Pick which partner this came from" }, { status: 400 });

  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token")
    .eq("id", partnerId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const extracted = { ...(row.extracted ?? {}), ...(body?.fields ?? {}) };
  if (!String(extracted.client_name ?? "").trim()) {
    return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  }

  // If the sender turns out to be someone on this partner's team, tie the lead
  // to them so their notifications route correctly from here on.
  // On a forward, the person to tie this to is whoever wrote the original —
  // not the agent who passed it along.
  const senderEmail = row.forwarded_from ?? row.from_email;
  let contactId: string | null = row.contact_id ?? null;
  if (!contactId && senderEmail) {
    const { data: c } = await db()
      .from("partner_contacts")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("email", String(senderEmail).toLowerCase())
      .maybeSingle();
    contactId = c?.id ?? null;
  }

  const referral = await createReferralFromInbound({
    accountId: account.id,
    partnerId: partner.id,
    contactId,
    partnerName: partner.name,
    contactName: row.from_name ?? null,
    extracted,
    subject: row.subject ?? "",
  });
  if (!referral) return NextResponse.json({ error: "Couldn't create the lead" }, { status: 500 });

  // The paperwork that arrived with the email has been parked in storage since
  // it landed. Now that there's a referral, put it on the file.
  await finishInboundDocs({
    accountId: account.id,
    referralId: referral.id,
    stored: Array.isArray(row.attachments) ? row.attachments : [],
    docFields: row.extracted ?? {},
  });

  const patch: Record<string, unknown> = {
    status: "created",
    referral_id: referral.id,
    partner_id: partner.id,
    contact_id: contactId,
    extracted,
  };

  // Acknowledgment is opt-in per accept here, since the agent may already have
  // replied by hand before getting to the queue.
  if (body?.acknowledge && senderEmail) {
    const sent = await sendAcknowledgment({
      accountId: account.id,
      to: senderEmail,
      referralId: referral.id,
      clientName: String(extracted.client_name),
      partnerName: partner.name,
      contactName: row.from_name ?? null,
      partnerToken: partner.token,
    });
    if (sent) patch.acked_at = new Date().toISOString();
  }

  await db().from("inbound_emails").update(patch).eq("id", id);
  return NextResponse.json({ ok: true, referral_id: referral.id });
}
