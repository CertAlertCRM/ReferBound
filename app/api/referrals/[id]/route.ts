import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { STATUSES } from "@/lib/config";
import { sendEmail, statusUpdateEmail, docsReadyEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { DOC_KINDS, STATUS_LABELS } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getAccount } from "@/lib/account";
import { fireWebhook } from "@/lib/webhook";
import { sendSms } from "@/lib/sms";

// Partner email cadence is deliberately sparse to avoid notification fatigue:
// one email at "quoted" (we're on it), then ONE combined email at
// "docs_delivered" (bound + documents ready together). Marking "bound" sends
// nothing — it's the agent's cue to upload EOI/RCE, and the portal shows the
// bound status live for anyone who looks.
const NOTIFY_STATUSES = new Set(["quoted", "docs_delivered"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ["client_name", "client_phone", "client_email", "closing_date", "notes", "lost_reason", "policy_lines"]) {
    if (f in body) patch[f] = body[f] === "" ? null : body[f];
  }
  if ("premium" in body) {
    const n = Number(String(body.premium).replace(/[^0-9.]/g, ""));
    patch.premium = Number.isFinite(n) && n > 0 ? n : null;
  }

  // Attribute (or re-attribute) the lead to a partner-team contact — used for
  // leads that arrived by text/call where the sender never self-identified.
  if ("contact_id" in body) {
    if (!body.contact_id) {
      patch.contact_id = null;
    } else {
      const { data: refRow } = await db()
        .from("referrals")
        .select("partner_id")
        .eq("id", params.id)
        .eq("account_id", account.id)
        .maybeSingle();
      const { data: c } = await db()
        .from("partner_contacts")
        .select("id, partner_id")
        .eq("id", String(body.contact_id))
        .maybeSingle();
      if (!refRow || !c || c.partner_id !== refRow.partner_id) {
        return NextResponse.json({ error: "contact doesn't belong to this partner" }, { status: 400 });
      }
      patch.contact_id = c.id;
    }
  }

  let statusChanged = false;
  if (body.status) {
    const valid = [...STATUSES, "lost"].includes(body.status);
    if (!valid) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    patch.status = body.status;
    statusChanged = true;
  }

  const { data: referral, error } = await db()
    .from("referrals")
    .update(patch)
    .eq("id", params.id)
    .eq("account_id", account.id)
    .select("*, partners(name, partner_type, token, emails), partner_contacts(name, email, phone, sms_opt_in, notify_channel), documents(kind, file_name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (statusChanged) {
    await db().from("status_events").insert({ referral_id: referral.id, status: referral.status });
    await logActivity(
      referral.id,
      "status_changed",
      `Status set to “${STATUS_LABELS[referral.status] ?? referral.status}”${
        referral.status === "lost" && referral.lost_reason ? ` — ${referral.lost_reason}` : ""
      }`,
      "agent"
    );
    await fireWebhook(account.id, "referral.status_changed", referral, referral.partners);

    if (NOTIFY_STATUSES.has(referral.status) && referral.partners) {
      const portalUrl = `${appUrl()}/p/${referral.partners.token}`;
      // Route deal-specific notices to whoever sent THIS lead, over the
      // channel(s) the agent chose for them: email, text, or both. A contact
      // set to text-only without a usable/consented phone falls back to email
      // rather than silently hearing nothing. No contact on the lead = the
      // partner's team email list, as before.
      const contact = (referral as any).partner_contacts;
      const smsCapable = Boolean(contact?.sms_opt_in && contact?.phone);
      const channel = contact?.notify_channel ?? "both";
      const wantsSms = smsCapable && channel !== "email";
      const wantsEmail = !contact || channel !== "sms" || !smsCapable;

      const recipients: string[] = contact?.email
        ? [contact.email]
        : (referral.partners.emails ?? []);
      if (wantsEmail) {
        if (referral.status === "docs_delivered") {
          const docList = (referral.documents ?? []).map(
            (d: any) => DOC_KINDS[d.kind] ?? d.file_name
          );
          await sendEmail({
            referralId: referral.id,
            kind: "docs_ready",
            to: recipients,
            subject: `${referral.client_name}: insurance documents ready`,
            html: docsReadyEmail(referral.client_name, docList, portalUrl),
          });
        } else if (referral.status !== "lost") {
          await sendEmail({
            referralId: referral.id,
            kind: "status_update",
            to: recipients,
            subject: `${referral.client_name}: insurance update`,
            html: statusUpdateEmail(referral.client_name, referral.status, portalUrl),
          });
        }
      }
      // "lost" is intentionally not emailed to the partner in the pilot —
      // that conversation deserves a personal touch. It's logged either way.

      // Opt-in text to the contact who sent this lead, at the two moments
      // LOs actually care about: quote's out, and docs are ready.
      if (wantsSms) {
        await sendSms({
          referralId: referral.id,
          kind: `status_${referral.status}`,
          to: contact.phone,
          body:
            referral.status === "docs_delivered"
              ? `ReferBound: ${referral.client_name} is bound — insurance docs are ready on your portal: ${portalUrl}`
              : `ReferBound: ${referral.client_name} has been quoted. Live status: ${portalUrl}`,
        });
      }
    }
  }

  return NextResponse.json({ referral });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await db().from("referrals").delete().eq("id", params.id).eq("account_id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
