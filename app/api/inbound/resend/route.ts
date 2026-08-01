import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyWebhook,
  matchSender,
  extractFromEmail,
  createReferralFromInbound,
  sendAcknowledgment,
  findForwardedSender,
  findForwardedName,
  INBOX_DOMAIN,
} from "@/lib/inbound";
import { sendEmail, newPartnerLeadEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { fireWebhook } from "@/lib/webhook";
import { appUrl } from "@/lib/helpers";
import {
  fetchInboundAttachments,
  storeInboundAttachments,
  extractFromAttachment,
  mergeExtracted,
  finishInboundDocs,
  type InboundAttachment,
} from "@/lib/inbound-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Inbound email webhook (Resend `email.received`).
//
// Everything here answers to one question: is this from somebody the agent
// already works with? If yes, the lead is created and answered like the agent
// would have answered it. If no, it lands in the review queue and nothing
// leaves the building — no auto-reply, no lead, no notification storm.
//
// Always returns 200 on anything that isn't a signature failure. A provider
// that gets a 500 retries, and a retry loop on a poison message is worse than
// a dropped one — the row is stored with the error either way.

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "inbound not configured" }, { status: 503 });
  }
  const ok = verifyWebhook(
    raw,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    secret
  );
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let event: any = null;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, skipped: "unparseable" });
  }
  if (event?.type !== "email.received") return NextResponse.json({ ok: true, skipped: event?.type });

  const d = event.data ?? {};
  const providerId: string | null = d.email_id ?? d.id ?? null;

  // Which agent's address was this sent to?
  const rawRecipients: any[] = [
    ...toArray(d.to),
    ...toArray(d.cc),
    ...toArray(d.received_for),
  ];
  const recipients: string[] = rawRecipients
    .map((x: any) => String(typeof x === "string" ? x : (x?.address ?? x?.email ?? "")).toLowerCase())
    .map((x) => x.match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? x)
    .filter(Boolean);
  const mine = recipients.find((r) => r.endsWith(`@${INBOX_DOMAIN}`));
  const slug = mine ? mine.split("@")[0] : null;
  if (!slug) return NextResponse.json({ ok: true, skipped: "no matching inbox" });

  const { data: account } = await db()
    .from("accounts")
    .select("id, email")
    .eq("inbox_slug", slug)
    .maybeSingle();
  if (!account) return NextResponse.json({ ok: true, skipped: "unknown inbox" });

  // Idempotency: a redelivered webhook must not create a second lead.
  if (providerId) {
    const { data: seen } = await db()
      .from("inbound_emails")
      .select("id")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (seen) return NextResponse.json({ ok: true, skipped: "already processed" });
  }

  const fromRaw = typeof d.from === "string" ? d.from : (d.from?.address ?? d.from?.email ?? "");
  const fromEmail = String(fromRaw).match(/[^\s<>]+@[^\s<>]+/)?.[0]?.toLowerCase() ?? "";
  const fromName =
    (typeof d.from === "object" ? d.from?.name : null) ??
    String(fromRaw).replace(/<[^>]*>/, "").replace(/"/g, "").trim() ??
    null;
  const subject = String(d.subject ?? "").slice(0, 500);

  // The webhook may or may not carry the body depending on the provider's
  // plan and version — fall back to the API when it doesn't.
  let body = String(d.text ?? d.plain ?? "").trim();
  if (!body && d.html) body = stripHtml(String(d.html));
  if (!body && providerId) body = await fetchBody(providerId);
  body = body.slice(0, 40000);

  // Who actually sent this referral. On a forward that's not the envelope
  // sender — it's whoever's From: line sits inside the body. Without this,
  // every forwarded email fails to match a partner and lands in review, which
  // is the exact opposite of what forwarding is for.
  let match = await matchSender(account.id, fromEmail);
  let forwardedFrom: string | null = null;

  if (match.kind === "none") {
    const original = findForwardedSender(body);
    if (original && original !== fromEmail) {
      const viaForward = await matchSender(account.id, original);
      if (viaForward.kind !== "none") {
        match = viaForward;
        forwardedFrom = original;
      }
    }
  }

  // Whoever we end up answering: the loan officer who wrote it, not the agent
  // who passed it along.
  const replyTo = forwardedFrom ?? fromEmail;

  const { data: prof } = await db()
    .from("agent_profile")
    .select("inbox_autocreate, inbox_autoack, phone, sms_new_lead")
    .eq("account_id", account.id)
    .maybeSingle();

  const row: Record<string, unknown> = {
    account_id: account.id,
    provider_id: providerId,
    from_email: fromEmail || "unknown",
    from_name: (forwardedFrom ? findForwardedName(body) : null) ?? fromName ?? null,
    forwarded_from: forwardedFrom,
    subject,
    body,
    partner_id: match.partnerId,
    contact_id: match.contactId,
    match_kind: match.kind,
    status: "pending",
  };

  // Extraction is best-effort. If Claude is down the message still lands in
  // the queue with its body intact, and the agent logs it by hand — the same
  // work they do today, not worse.
  let extracted: any = null;
  try {
    if (body || subject) extracted = await extractFromEmail(subject, body);
    row.extracted = extracted;
  } catch (e: any) {
    row.error = String(e?.message ?? e).slice(0, 500);
  }

  // Attachments. A loan officer's intro is often three words and a PDF, so the
  // document has to be read BEFORE the auto-create decision — otherwise "see
  // attached" can never clear the confidence bar and the best referrals are
  // exactly the ones that get held.
  let stored: InboundAttachment[] = [];
  let docFields: any = null;
  const inboundId = crypto.randomUUID();
  try {
    const files = await fetchInboundAttachments(providerId ?? "", d.attachments ?? []);
    if (files.length > 0) {
      stored = await storeInboundAttachments(account.id, inboundId, files);
      for (const f of files) {
        const fields = await extractFromAttachment(f.buffer, f.filename);
        if (fields?.client_name || fields?.property_address) {
          docFields = { ...(docFields ?? {}), ...fields };
        }
      }
      if (docFields) extracted = mergeExtracted(extracted, docFields);
      row.extracted = extracted;
    }
  } catch (e: any) {
    row.error = String(e?.message ?? e).slice(0, 500);
  }
  row.id = inboundId;
  row.attachments = stored.length > 0 ? stored : null;

  const looksLikeReferral = extracted?.is_referral !== false && Boolean(extracted?.client_name);
  const autoCreate =
    prof?.inbox_autocreate !== false && match.partnerId && looksLikeReferral && extracted?.confidence !== "low";

  if (!autoCreate) {
    await db().from("inbound_emails").insert(row);
    return NextResponse.json({ ok: true, held: true });
  }

  const referral = await createReferralFromInbound({
    accountId: account.id,
    partnerId: match.partnerId!,
    contactId: match.contactId,
    partnerName: match.partnerName ?? "a partner",
    contactName: match.contactName,
    extracted,
    subject,
  });

  if (!referral) {
    await db().from("inbound_emails").insert({ ...row, error: "could not create referral" });
    return NextResponse.json({ ok: true, held: true });
  }

  row.status = "created";
  row.referral_id = referral.id;

  await finishInboundDocs({
    accountId: account.id,
    referralId: referral.id,
    stored,
    docFields,
  });

  // Acknowledge — but only to a sender we actually recognize.
  if (prof?.inbox_autoack !== false && replyTo && match.kind !== "none") {
    const { data: partner } = await db()
      .from("partners")
      .select("token")
      .eq("id", match.partnerId!)
      .maybeSingle();
    if (partner?.token) {
      const sent = await sendAcknowledgment({
        accountId: account.id,
        to: replyTo,
        referralId: referral.id,
        clientName: String(extracted.client_name),
        partnerName: match.partnerName ?? "",
        contactName: match.contactName,
        partnerToken: partner.token,
      });
      if (sent) row.acked_at = new Date().toISOString();
    }
  }

  await db().from("inbound_emails").insert(row);

  // Same downstream treatment a portal submission gets — the agent shouldn't
  // have to learn which door a lead came through.
  const { data: full } = await db()
    .from("referrals")
    .select("*, partners(name, token, emails)")
    .eq("id", referral.id)
    .maybeSingle();
  if (full) await fireWebhook(account.id, "referral.created", full, (full as any).partners);

  if (prof?.sms_new_lead && prof?.phone) {
    await sendSms({
      referralId: referral.id,
      kind: "new_lead",
      to: prof.phone,
      body: `ReferBound: emailed referral from ${
        match.contactName ? `${match.contactName} (${match.partnerName})` : match.partnerName
      } — ${extracted.client_name}. Open referbound.com to start the quote.`,
    });
  }
  await sendEmail({
    referralId: referral.id,
    kind: "new_partner_lead",
    to: account.email ? [account.email] : [],
    subject: `New referral from ${match.partnerName}: ${extracted.client_name}`,
    html: newPartnerLeadEmail(String(extracted.client_name), match.partnerName ?? "", appUrl()),
  });

  return NextResponse.json({ ok: true, referral_id: referral.id });
}

// Provider payloads vary on whether the body ships with the event. Try the
// documented shapes in order rather than betting the feature on one path.
async function fetchBody(emailId: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "";
  for (const path of [`emails/receiving/${emailId}`, `emails/received/${emailId}`, `emails/${emailId}`]) {
    try {
      const res = await fetch(`https://api.resend.com/${path}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) continue;
      const j = await res.json();
      const text = j?.text ?? j?.plain ?? j?.data?.text ?? "";
      if (text) return String(text);
      const html = j?.html ?? j?.data?.html ?? "";
      if (html) return stripHtml(String(html));
    } catch {
      // Try the next shape.
    }
  }
  return "";
}

function toArray(v: unknown): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
