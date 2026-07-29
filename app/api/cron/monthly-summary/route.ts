import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SAFE_STATUSES, APP_CONFIG } from "@/lib/config";
import { sendEmail, monthlySummaryEmail, thankYouEmail } from "@/lib/email";
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

  // Per-account agent names (from each account's profile).
  const { data: profiles } = await db()
    .from("agent_profile")
    .select("account_id, display_name");
  const nameByAccount = new Map(
    (profiles ?? []).filter((p) => p.account_id).map((p) => [p.account_id, p.display_name])
  );

  const { data: partners, error: pErr } = await db()
    .from("partners")
    .select("id, name, token, emails, account_id, monthly_summary");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  let sent = 0;
  const skipped: string[] = [];

  for (const partner of partners ?? []) {
    if (!partner.emails || partner.emails.length === 0) {
      skipped.push(`${partner.name}: no emails`);
      continue;
    }
    // Per-partner opt-out: some partners want the service, not the scoreboard.
    if ((partner as any).monthly_summary === false) {
      skipped.push(`${partner.name}: recap turned off`);
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

    const agentName =
      nameByAccount.get((partner as any).account_id) || APP_CONFIG.agentName;

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

  // ── Partner thank-you notes (opt-in per account, agent-chosen cadence) ────
  // Monthly cadence fires every run; quarterly fires on Jan/Apr/Jul/Oct 1st.
  // Metric-free by design — a warm note, never a scoreboard.
  const isQuarterStart = [0, 3, 6, 9].includes(now.getUTCMonth());
  const { data: accounts } = await db()
    .from("accounts")
    .select("id, thankyou_cadence")
    .neq("thankyou_cadence", "off");
  let thanked = 0;

  for (const acct of accounts ?? []) {
    if (acct.thankyou_cadence === "quarterly" && !isQuarterStart) continue;
    const periodLabel = acct.thankyou_cadence === "quarterly" ? "this past quarter" : "this past month";
    const agentName = nameByAccount.get(acct.id) || APP_CONFIG.agentName;

    for (const partner of (partners ?? []).filter((p) => (p as any).account_id === acct.id)) {
      if (!partner.emails || partner.emails.length === 0) continue;

      // Only thank partners who've actually referred someone, ever.
      const { count } = await db()
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partner.id);
      if (!count) continue;

      const subject = `A thank-you from ${agentName} — ${monthLabel}`;
      const { data: existing } = await db()
        .from("email_log")
        .select("id")
        .eq("kind", "thank_you")
        .eq("subject", subject)
        .contains("recipients", [partner.emails[0]])
        .eq("sent", true)
        .limit(1);
      if (existing && existing.length > 0) continue;

      await sendEmail({
        kind: "thank_you",
        to: partner.emails,
        subject,
        html: thankYouEmail(partner.name, agentName, periodLabel),
      });
      thanked++;
    }
  }

  return NextResponse.json({ month: monthLabel, sent, thanked, skipped });
}
