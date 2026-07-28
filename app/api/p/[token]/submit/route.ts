import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, newPartnerLeadEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { logActivity } from "@/lib/activity";
import { normalizePhone, normalizeEmail, EMAIL_RE } from "@/lib/format";

// Partner submits a new referral from their magic-link portal. Three fields.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = String(body?.client_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Client name is required" }, { status: 400 });

  const email = normalizeEmail(body?.client_email);
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That client email doesn't look right — check the @ and domain." }, { status: 400 });
  }

  const { data: referral, error } = await db()
    .from("referrals")
    .insert({
      partner_id: partner.id,
      client_name: name,
      coborrower_name: String(body?.coborrower_name ?? "").trim() || null,
      client_phone: normalizePhone(body?.client_phone),
      client_email: email,
      client_dob: body?.client_dob || null,
      property_address: body?.property_address || null,
      closing_date: body?.closing_date || null,
      notes: body?.notes || null,
      source: "partner",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db().from("status_events").insert({ referral_id: referral.id, status: "new" });
  await logActivity(
    referral.id,
    "referral_submitted",
    `Referral submitted by ${partner.name} via portal${
      referral.property_address ? ` — ${referral.property_address}` : ""
    }`,
    "partner"
  );

  const agentEmail = process.env.AGENT_EMAIL;
  await sendEmail({
    referralId: referral.id,
    kind: "new_partner_lead",
    to: agentEmail ? [agentEmail] : [],
    subject: `New referral from ${partner.name}: ${referral.client_name}`,
    html: newPartnerLeadEmail(referral.client_name, partner.name, appUrl()),
  });

  return NextResponse.json({ ok: true, referral_id: referral.id });
}
