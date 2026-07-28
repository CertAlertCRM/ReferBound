import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SAFE_STATUSES, APP_CONFIG } from "@/lib/config";
import { sendEmail, monthlySummaryEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";

// Monthly partner summary — runs on the 1st (see vercel.json) and reports on
// the PREVIOUS calendar month. Guarded by CRON_SECRET; safe to trigger
// manually: GET /api/cron/monthly-summary?secret=...
// Dedupe: one summary per partner per month, keyed on the email subject.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (secret && auth !== `Bearer ${secret}` && qs !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Previous calendar month boundaries (UTC).
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name")
    .eq("id", "default")
    .maybeSingle();
  const agentName = prof?.display_name || APP_CONFIG.agentName;

  const { data: partners, error: pErr } = await db()
    .from("partners")
    .select("id, name, token, emails");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  let sent = 0;
  const skipped: string[] = [];

  for (const partner of partners ?? []) {
    if (!partner.emails || partner.emails.length === 0) {
      skipped.push(`${partner.name}: no emails`);
      continue;
    }

    const subject = `${monthLabel} referral summary — ${partner.name}`;

    // Dedupe: already sent this month's summary to this partner?
    const { data: existing } = await db()
      .from("email_log")
      .select("id")
      .eq("kind", "monthly_summary")
      .eq("subject", subject)
      .eq("sent", true)
      .limit(1);
    if (existing && existing.length > 0) {
      skipped.push(`${partner.name}: already sent`);
      continue;
    }

    const { data: refs, error: rErr } = await db()
      .from("referrals")
      .select("id, status, created_at")
      .eq("partner_id", partner.id);
    if (rErr) {
      skipped.push(`${partner.name}: ${rErr.message}`);
      continue;
    }
    const all = refs ?? [];
    if (all.length === 0) {
      skipped.push(`${partner.name}: no referrals ever`);
      continue;
    }

    const referredThisMonth = all.filter(
      (r) => r.created_at >= monthStart.toISOString() && r.created_at < monthEnd.toISOString()
    ).length;

    // Bound-this-month comes from status_events so a deal referred earlier
    // but bound last month still counts.
    const ids = all.map((r) => r.id);
    const { data: boundEvents } = await db()
      .from("status_events")
      .select("referral_id, created_at")
      .eq("status", "bound")
      .in("referral_id", ids)
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString());
    const boundThisMonth = new Set((boundEvents ?? []).map((e) => e.referral_id)).size;

    const inProgress = all.filter(
      (r) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost"
    ).length;
    const allTimeBound = all.filter((r) => SAFE_STATUSES.includes(r.status)).length;

    // Nothing to say this month and nothing in motion — stay quiet.
    if (referredThisMonth === 0 && boundThisMonth === 0 && inProgress === 0) {
      skipped.push(`${partner.name}: quiet month`);
      continue;
    }

    await sendEmail({
      kind: "monthly_summary",
      to: partner.emails,
      subject,
      html: monthlySummaryEmail(
        partner.name,
        agentName,
        monthLabel,
        { referred: referredThisMonth, bound: boundThisMonth, inProgress, allTimeBound },
        `${appUrl()}/p/${partner.token}`
      ),
    });
    sent++;
  }

  return NextResponse.json({ month: monthLabel, sent, skipped });
}
