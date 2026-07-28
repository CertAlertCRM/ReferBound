import { db } from "@/lib/db";
import { APP_CONFIG, STATUS_LABELS } from "@/lib/config";

// Email is best-effort: if RESEND_API_KEY isn't configured, every send is
// logged to email_log with sent=false so the pilot still works end-to-end.

type SendArgs = {
  referralId?: string;
  kind:
    | "status_update"
    | "docs_ready"
    | "new_partner_lead"
    | "at_risk"
    | "monthly_summary"
    | "message"
    | "agent_digest";
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

  if (log.sent && referralId) {
    // Best-effort activity entry; inline to avoid a circular import.
    await db()
      .from("activity_log")
      .insert({
        referral_id: referralId,
        event_type: "email_sent",
        detail: `Email sent (${recipients.length} recipient${recipients.length === 1 ? "" : "s"}): ${subject}`,
        actor: "system",
      })
      .then(({ error }) => {
        if (error) console.error("activity log write failed:", error.message);
      });
  }
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

export function monthlySummaryEmail(
  partnerName: string,
  agentName: string,
  monthLabel: string,
  stats: { referred: number; bound: number; inProgress: number; allTimeBound: number },
  portalUrl: string
) {
  return wrap(`
    <h2 style="margin:0 0 12px">${monthLabel} — your referrals with ${agentName}</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:12px;text-align:center;background:#eef4ff;border-radius:8px">
          <div style="font-size:24px;font-weight:700">${stats.referred}</div>
          <div style="font-size:12px;color:#555">referred this month</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:12px;text-align:center;background:#ecfdf5;border-radius:8px">
          <div style="font-size:24px;font-weight:700">${stats.bound}</div>
          <div style="font-size:12px;color:#555">bound this month</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:12px;text-align:center;background:#f8fafc;border-radius:8px">
          <div style="font-size:24px;font-weight:700">${stats.inProgress}</div>
          <div style="font-size:12px;color:#555">in progress now</div>
        </td>
      </tr>
    </table>
    <p style="font-size:15px">${stats.allTimeBound} of your referred clients are covered all-time. Thank you for trusting ${agentName} with them — it never goes unnoticed.</p>
    <p><a href="${portalUrl}" style="color:#1d4ed8">See every referral live in your portal</a></p>
  `);
}

export function messageEmail(
  fromName: string,
  clientName: string,
  body: string,
  linkUrl: string,
  linkLabel: string
) {
  const safeBody = body.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return wrap(`
    <h2 style="margin:0 0 12px">${fromName} — about ${clientName}</h2>
    <blockquote style="margin:0;padding:12px 16px;background:#f8fafc;border-left:3px solid #2547eb;border-radius:6px;font-size:15px">${safeBody}</blockquote>
    <p style="margin-top:16px"><a href="${linkUrl}" style="color:#1d4ed8">${linkLabel}</a></p>
  `);
}

export function agentDigestEmail(
  stale: { name: string; status: string; days: number }[],
  closingSoon: { name: string; closing: string; status: string }[],
  appLink: string
) {
  const staleHtml = stale.length
    ? `<h3 style="margin:16px 0 6px;font-size:14px">Needs a touch (no update in 3+ days)</h3>
       <ul style="margin:0;padding-left:18px;font-size:14px">${stale
         .map((s) => `<li><strong>${s.name}</strong> — ${s.status}, ${s.days}d since last update</li>`)
         .join("")}</ul>`
    : "";
  const closingHtml = closingSoon.length
    ? `<h3 style="margin:16px 0 6px;font-size:14px;color:#b91c1c">Closing soon, not bound</h3>
       <ul style="margin:0;padding-left:18px;font-size:14px">${closingSoon
         .map((c) => `<li><strong>${c.name}</strong> — closes ${c.closing} (${c.status})</li>`)
         .join("")}</ul>`
    : "";
  return wrap(`
    <h2 style="margin:0 0 4px">Your ReferBound morning check</h2>
    <p style="font-size:14px;color:#555;margin:0">Fresh statuses are what keep your partners trusting the portal.</p>
    ${closingHtml}
    ${staleHtml}
    <p style="margin-top:16px"><a href="${appLink}" style="color:#1d4ed8">Open your dashboard</a></p>
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
