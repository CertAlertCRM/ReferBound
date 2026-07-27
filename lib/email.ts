import { db } from "@/lib/db";
import { APP_CONFIG, STATUS_LABELS } from "@/lib/config";

// Email is best-effort: if RESEND_API_KEY isn't configured, every send is
// logged to email_log with sent=false so the pilot still works end-to-end.

type SendArgs = {
  referralId?: string;
  kind: "status_update" | "docs_ready" | "new_partner_lead" | "at_risk";
  to: string[];
  subject: string;
  html: string;
};

export async function sendEmail({ referralId, kind, to, subject, html }: SendArgs) {
  const recipients = to.filter(Boolean);
  const log = {
    referral_id: referralId ?? null,
    kind,
    recipients,
    subject,
    sent: false,
    error: null as string | null,
  };

  if (recipients.length === 0) {
    log.error = "no recipients";
    await db().from("email_log").insert(log);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    log.error = "email not configured (RESEND_API_KEY / EMAIL_FROM missing)";
    await db().from("email_log").insert(log);
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
    });
    if (error) log.error = String(error.message ?? error);
    else log.sent = true;
  } catch (e: any) {
    log.error = String(e?.message ?? e);
  }
  await db().from("email_log").insert(log);
}

function wrap(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  ${body}
  <p style="margin-top:32px;font-size:12px;color:#888">Sent by ${APP_CONFIG.agencyName} via ${APP_CONFIG.productName}</p>
</div>`;
}

export function statusUpdateEmail(clientName: string, status: string, portalUrl: string) {
  const label = STATUS_LABELS[status] ?? status;
  return wrap(`
    <h2 style="margin:0 0 12px">Update on ${clientName}</h2>
    <p style="font-size:16px">Insurance status: <strong>${label}</strong></p>
    <p><a href="${portalUrl}" style="color:#1d4ed8">Open your referral portal</a> for details.</p>
  `);
}

export function docsReadyEmail(clientName: string, docList: string[], portalUrl: string) {
  return wrap(`
    <h2 style="margin:0 0 12px">${clientName} is bound — documents ready</h2>
    <p style="font-size:16px">The following documents are ready to download:</p>
    <ul>${docList.map((d) => `<li>${d}</li>`).join("")}</ul>
    <p><a href="${portalUrl}" style="color:#1d4ed8">Download from your referral portal</a></p>
  `);
}

export function newPartnerLeadEmail(clientName: string, partnerName: string, appUrl: string) {
  return wrap(`
    <h2 style="margin:0 0 12px">New referral from ${partnerName}</h2>
    <p style="font-size:16px"><strong>${clientName}</strong> was just submitted through the partner portal.</p>
    <p><a href="${appUrl}" style="color:#1d4ed8">Open your dashboard</a> to start the quote.</p>
  `);
}

export function atRiskEmail(clientName: string, closingDate: string, status: string, portalUrl: string) {
  const label = STATUS_LABELS[status] ?? status;
  return wrap(`
    <h2 style="margin:0 0 12px;color:#b91c1c">⚠ Closing soon: ${clientName}</h2>
    <p style="font-size:16px">Closing date <strong>${closingDate}</strong> is approaching and insurance is not yet bound (current status: <strong>${label}</strong>).</p>
    <p><a href="${portalUrl}" style="color:#1d4ed8">View in the referral portal</a></p>
  `);
}
