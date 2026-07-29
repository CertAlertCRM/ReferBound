import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, newPartnerLeadEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { logActivity } from "@/lib/activity";
import { normalizePhone, normalizeEmail, EMAIL_RE } from "@/lib/format";
import { fireWebhook } from "@/lib/webhook";
import { rateLimit, RATE_LIMITED } from "@/lib/ratelimit";
import { sendSms } from "@/lib/sms";

// Partner submits a new referral from their magic-link portal. Three fields.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, partner_type, account_id")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!(await rateLimit(`submit:${partner.id}`, 30, 3600))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.client_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Client name is required" }, { status: 400 });

  const email = normalizeEmail(body?.client_email);
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That client email doesn't look right — check the @ and domain." }, { status: 400 });
  }

  // Who on the partner's team is sending this? Existing contact by id, or a
  // new name+email pair (deduped by email per partner).
  let contactId: string | null = null;
  let contactName: string | null = null;
  if (body?.sender_contact_id) {
    const { data: c } = await db()
      .from("partner_contacts")
      .select("id, name")
      .eq("id", String(body.sender_contact_id))
      .eq("partner_id", partner.id)
      .maybeSingle();
    if (c) {
      contactId = c.id;
      contactName = c.name;
    }
  } else if (body?.sender_name && body?.sender_email) {
    const sName = String(body.sender_name).trim().slice(0, 120);
    const sEmail = normalizeEmail(body.sender_email);
    if (sName && sEmail && EMAIL_RE.test(sEmail)) {
      const { data: existingC } = await db()
        .from("partner_contacts")
        .select("id, name")
        .eq("partner_id", partner.id)
        .eq("email", sEmail)
        .maybeSingle();
      if (existingC) {
        contactId = existingC.id;
        contactName = existingC.name;
      } else {
        const sPhone = String(body?.sender_phone ?? "").replace(/[^\d\-() +.]/g, "").slice(0, 20) || null;
        const sOptIn = Boolean(body?.sender_sms_opt_in) && Boolean(sPhone);
        const { data: created } = await db()
          .from("partner_contacts")
          .insert({ partner_id: partner.id, name: sName, email: sEmail, phone: sPhone, sms_opt_in: sOptIn })
          .select("id, name")
          .single();
        if (created) {
          contactId = created.id;
          contactName = created.name;
        }
      }
    }
  }

  const { data: referral, error } = await db()
    .from("referrals")
    .insert({
      partner_id: partner.id,
      account_id: (partner as any).account_id,
      client_name: name,
      coborrower_name: String(body?.coborrower_name ?? "").trim() || null,
      client_phone: normalizePhone(body?.client_phone),
      client_email: email,
      client_dob: body?.client_dob || null,
      property_address: body?.property_address || null,
      closing_date: body?.closing_date || null,
      notes: body?.notes || null,
      source: "partner",
      contact_id: contactId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db().from("status_events").insert({ referral_id: referral.id, status: "new" });
  await logActivity(
    referral.id,
    "referral_submitted",
    `Referral submitted by ${contactName ? `${contactName} at ` : ""}${partner.name} via portal${
      referral.property_address ? ` — ${referral.property_address}` : ""
    }`,
    "partner"
  );

  const { data: ownerAccount } = await db()
    .from("accounts")
    .select("email")
    .eq("id", (partner as any).account_id)
    .maybeSingle();
  const agentEmail = ownerAccount?.email || process.env.AGENT_EMAIL;
  await fireWebhook((partner as any).account_id, "referral.created", referral, partner as any);

  // Opt-in text to the agent — the "never miss a lead" moment.
  const { data: agentProf } = await db()
    .from("agent_profile")
    .select("phone, sms_new_lead")
    .eq("account_id", (partner as any).account_id)
    .maybeSingle();
  if (agentProf?.sms_new_lead && agentProf?.phone) {
    await sendSms({
      referralId: referral.id,
      kind: "new_lead",
      to: agentProf.phone,
      body: `ReferBound: new referral from ${contactName ? `${contactName} (${partner.name})` : partner.name} — ${referral.client_name}. Open referbound.com to start the quote.`,
    });
  }
  await sendEmail({
    referralId: referral.id,
    kind: "new_partner_lead",
    to: agentEmail ? [agentEmail] : [],
    subject: `New referral from ${contactName ? `${contactName} (${partner.name})` : partner.name}: ${referral.client_name}`,
    html: newPartnerLeadEmail(referral.client_name, partner.name, appUrl()),
  });

  return NextResponse.json({ ok: true, referral_id: referral.id });
}
