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
    | "agent_digest"
    | "welcome"
    | "review_request"
    | "thank_you"
    | "partner_closings"
    | "hub_link"
    | "feedback"
    | "portal_invite";
  to: string[];
  subject: string;
  html: string;
};

export async function sendEmail({ referralId, kind, to, subject, html }: SendArgs): Promise<{ sent: boolean; error: string | null }> {
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
    return { sent: false, error: log.error };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    log.error = "email not configured (RESEND_API_KEY / EMAIL_FROM missing)";
    await db().from("email_log").insert(log);
    return { sent: false, error: log.error };
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

  return { sent: log.sent, error: log.error };
}

function wrap(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  ${body}
  <p style="margin-top:32px;font-size:12px;color:#888">Sent via ${APP_CONFIG.productName}</p>
</div>`;
}

export function plainBodyEmail(body: string) {
  const safe = body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  return wrap(`<div style="font-size:15px;line-height:1.7">${safe}</div>`);
}

export function feedbackEmail(source: string, fromLabel: string, message: string) {
  const safe = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return wrap(`
    <h2 style="margin:0 0 12px">Product feedback — ${source}</h2>
    <p style="font-size:13px;color:#555">${fromLabel}</p>
    <div style="margin-top:14px;padding:16px 18px;border-left:3px solid #2547eb;background:#f6f8ff;border-radius:0 10px 10px 0;font-size:15px;line-height:1.7;white-space:pre-wrap">${safe}</div>
  `);
}

export function partnerClosingsEmail(
  partnerName: string,
  items: { name: string; closing: string; statusLabel: string; done: boolean }[],
  portalUrl: string
) {
  const ready = items.filter((i) => i.done);
  const open = items.filter((i) => !i.done);
  return wrap(`
    <h2 style="margin:0 0 12px">Your closings — next 14 days</h2>
    <p style="font-size:15px">Hi ${partnerName} team — insurance status on everything closing soon:</p>
    ${
      open.length
        ? `<p style="font-size:14px;font-weight:600;margin:16px 0 6px">⚠ Still in motion</p>
           <ul style="font-size:14px;line-height:1.7;margin:0;padding-left:20px">
             ${open.map((i) => `<li><strong>${i.name}</strong> — closes ${i.closing} · ${i.statusLabel}</li>`).join("")}
           </ul>`
        : ""
    }
    ${
      ready.length
        ? `<p style="font-size:14px;font-weight:600;margin:16px 0 6px">✓ Insurance ready</p>
           <ul style="font-size:14px;line-height:1.7;margin:0;padding-left:20px">
             ${ready.map((i) => `<li><strong>${i.name}</strong> — closes ${i.closing}</li>`).join("")}
           </ul>`
        : ""
    }
    <p style="margin-top:18px"><a href="${portalUrl}" style="color:#1d4ed8;font-weight:600">Open your live portal</a> for documents and details.</p>
  `);
}

export function hubLinkEmail(hubUrl: string) {
  return wrap(`
    <h2 style="margin:0 0 12px">Your referral board</h2>
    <p style="font-size:15px">Here's your personal link — every insurance agent you work with on ReferBound, every referral, one page:</p>
    <p style="margin:20px 0"><a href="${hubUrl}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open my board</a></p>
    <p style="font-size:13px;color:#555">Bookmark it — no login, always live. This link is private to this email address; don't forward it.</p>
  `);
}

export function reviewRequestEmail(
  clientName: string,
  agentName: string,
  agencyName: string | null,
  reviewUrl: string
) {
  const firstName = clientName.split(" ")[0];
  return wrap(`
    <h2 style="margin:0 0 12px">Thanks for trusting ${agencyName || "us"} with your insurance</h2>
    <p style="font-size:15px">Hi ${firstName},</p>
    <p style="font-size:15px">It was a pleasure getting your coverage in place. If you had a good experience working with ${agentName}, a quick Google review would mean a lot — it's the best way to help other families find us.</p>
    <p style="margin:20px 0"><a href="${reviewUrl}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Leave a review — takes 60 seconds</a></p>
    <p style="font-size:13px;color:#555">And if anything wasn't right, just reply to this email — ${agentName} reads every one.</p>
  `);
}

export function thankYouEmail(partnerName: string, agentName: string, periodLabel: string) {
  return wrap(`
    <h2 style="margin:0 0 12px">Thank you</h2>
    <p style="font-size:15px">Hi ${partnerName} team,</p>
    <p style="font-size:15px">No numbers, no updates — just a genuine thank-you. The clients you've trusted us with ${periodLabel} mean a lot, and we work hard to make sure every one of them reflects well on you.</p>
    <p style="font-size:15px">If there's ever anything we can do better — faster turnarounds, different updates, anything — just reply. This inbox reaches ${agentName} directly.</p>
    <p style="font-size:15px">— ${agentName}</p>
  `);
}

export function welcomeEmail(name: string | null, appUrl: string, isTeamMember: boolean) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  if (isTeamMember) {
    return wrap(`
    <h2 style="margin:0 0 12px">You're on the team</h2>
    <p style="font-size:15px">${hi}</p>
    <p style="font-size:15px">Your agency's partners and referrals are already in your dashboard — nothing to set up. Jump in, work your leads, and every update you make shows on your partners' live portals.</p>
    <p><a href="${appUrl}" style="color:#1d4ed8;font-weight:600">Open your dashboard</a></p>
  `);
  }
  return wrap(`
    <h2 style="margin:0 0 12px">Welcome — here's how to get your first partner live</h2>
    <p style="font-size:15px">${hi}</p>
    <p style="font-size:15px">Three steps, about five minutes total:</p>
    <ol style="font-size:15px;line-height:1.7;padding-left:20px">
      <li><strong>Fill in your profile</strong> — your name and headshot appear on every partner portal.</li>
      <li><strong>Add your best referral partner</strong> — the lender or realtor who sends you the most business.</li>
      <li><strong>Text or email them their magic link</strong> — one tap Copy on the Partners page. No login on their end, ever.</li>
    </ol>
    <p style="font-size:15px">From then on, every lead they send shows up on your dashboard, and every status you set shows up live on their portal.</p>
    <p><a href="${appUrl}/profile" style="color:#1d4ed8;font-weight:600">Start with your profile</a></p>
  `);
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
