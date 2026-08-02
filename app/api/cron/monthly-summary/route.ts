import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SAFE_STATUSES } from "@/lib/config";
import { monthlySummaryEmail, thankYouEmail, plainBodyEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { renderVoice, type NotifyTemplates } from "@/lib/voice";
import { Budget, cronGuard, cronReport, fetchAll, sendBatch, type BatchItem } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Monthly partner summary — runs on the 1st (see vercel.json) and reports on
// the PREVIOUS calendar month. Guarded by CRON_SECRET; safe to trigger
// manually: GET /api/cron/monthly-summary?secret=...
//
// This was the heaviest of the crons by a distance: four sequential queries
// and a send for every partner, so two hundred partners meant a thousand
// round-trips in one invocation. It now reads every partner's referrals and
// bound events in a handful of chunked queries and sends in batches of a
// hundred. The dedupe still keys on the email subject, which carries the
// month name — so a re-run inside the same month stays quiet.

export async function GET(req: NextRequest) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const budget = new Budget(240);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const { data: profiles } = await db()
    .from("agent_profile")
    .select("account_id, display_name, notify_templates");
  const nameByAccount = new Map<string, string>(
    ((profiles ?? []) as any[])
      .filter((p) => p.account_id)
      .map((p) => [String(p.account_id), String(p.display_name ?? "")])
  );
  const voiceByAccount = new Map<string, NotifyTemplates>(
    ((profiles ?? []) as any[])
      .filter((p) => p.account_id)
      .map((p) => [String(p.account_id), (p.notify_templates ?? {}) as NotifyTemplates])
  );

  const partnerRead = await fetchAll<any>((from, to) =>
    db()
      .from("partners")
      .select("id, name, token, emails, account_id, monthly_summary, thankyou_cadence")
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (partnerRead.error) {
    return NextResponse.json(cronReport("monthly-summary", { error: partnerRead.error }), {
      status: 500,
    });
  }
  const partners = partnerRead.rows;

  const isQuarterStart = [0, 3, 6, 9].includes(now.getUTCMonth());
  const wantsSummary = (p: any) => Boolean(p.emails?.length) && p.monthly_summary !== false;
  const wantsThanks = (p: any) => {
    const cadence = p.thankyou_cadence ?? "off";
    if (!p.emails?.length || cadence === "off") return false;
    return cadence !== "quarterly" || isQuarterStart;
  };

  // Every partner we might write to this run — read their referrals once.
  const relevant = partners.filter((p) => wantsSummary(p) || wantsThanks(p));
  const relevantIds = relevant.map((p) => p.id);

  const refsByPartner = new Map<string, { id: string; status: string; created_at: string }[]>();
  for (let i = 0; i < relevantIds.length; i += 200) {
    const slice = relevantIds.slice(i, i + 200);
    const read = await fetchAll<any>((from, to) =>
      db()
        .from("referrals")
        .select("id, status, created_at, partner_id")
        .in("partner_id", slice)
        .order("id", { ascending: true })
        .range(from, to)
    );
    for (const r of read.rows) {
      if (!r.partner_id) continue;
      if (!refsByPartner.has(r.partner_id)) refsByPartner.set(r.partner_id, []);
      refsByPartner.get(r.partner_id)!.push(r);
    }
  }

  // Bound-this-month comes from status_events so a deal referred earlier but
  // bound last month still counts. One pass over every referral id we hold.
  const allRefIds = Array.from(refsByPartner.values()).flatMap((rs) => rs.map((r) => r.id));
  const boundRefIds = new Set<string>();
  for (let i = 0; i < allRefIds.length; i += 200) {
    const { data } = await db()
      .from("status_events")
      .select("referral_id")
      .eq("status", "bound")
      .in("referral_id", allRefIds.slice(i, i + 200))
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString());
    for (const e of data ?? []) if (e.referral_id) boundRefIds.add(e.referral_id);
  }

  // Dedupe history for both message types, read once.
  const { data: priorSummaries } = await db()
    .from("email_log")
    .select("subject")
    .eq("kind", "monthly_summary")
    .eq("sent", true)
    .gte("created_at", monthStart.toISOString());
  const summarySubjects = new Set((priorSummaries ?? []).map((r) => r.subject));

  const { data: priorThanks } = await db()
    .from("email_log")
    .select("subject, recipients")
    .eq("kind", "thank_you")
    .eq("sent", true)
    .gte("created_at", monthStart.toISOString());
  const thankKeys = new Set<string>();
  for (const row of priorThanks ?? []) {
    for (const addr of (row.recipients as string[]) ?? []) thankKeys.add(`${row.subject}|${addr}`);
  }

  const queue: BatchItem[] = [];
  const skipped: string[] = [];

  // ── Monthly recaps ────────────────────────────────────────────────────────
  for (const partner of partners) {
    if (!partner.emails?.length) {
      skipped.push(`${partner.name}: no emails`);
      continue;
    }
    // Per-partner opt-out: some partners want the service, not the scoreboard.
    if (partner.monthly_summary === false) {
      skipped.push(`${partner.name}: recap turned off`);
      continue;
    }

    const subject = `${monthLabel} referral summary — ${partner.name}`;
    if (summarySubjects.has(subject)) {
      skipped.push(`${partner.name}: already sent`);
      continue;
    }

    const all = refsByPartner.get(partner.id) ?? [];
    if (all.length === 0) {
      skipped.push(`${partner.name}: no referrals ever`);
      continue;
    }

    const referredThisMonth = all.filter(
      (r) => r.created_at >= monthStart.toISOString() && r.created_at < monthEnd.toISOString()
    ).length;
    const boundThisMonth = all.filter((r) => boundRefIds.has(r.id)).length;
    const inProgress = all.filter(
      (r) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost"
    ).length;
    const allTimeBound = all.filter((r) => SAFE_STATUSES.includes(r.status)).length;

    // Nothing to say this month and nothing in motion — stay quiet.
    if (referredThisMonth === 0 && boundThisMonth === 0 && inProgress === 0) {
      skipped.push(`${partner.name}: quiet month`);
      continue;
    }

    const agentName = nameByAccount.get(partner.account_id) || "Your agent";
    const voice = voiceByAccount.get(partner.account_id);
    const intro = voice?.email_recap_intro
      ? renderVoice(voice.email_recap_intro, {
          partner: partner.name,
          month: monthLabel,
          agent: agentName,
        })
      : null;

    queue.push({
      kind: "monthly_summary",
      to: partner.emails,
      subject,
      html: monthlySummaryEmail(
        partner.name,
        agentName,
        monthLabel,
        { referred: referredThisMonth, bound: boundThisMonth, inProgress, allTimeBound },
        `${appUrl()}/p/${partner.token}`,
        intro
      ),
    });
  }
  const summariesQueued = queue.length;

  // ── Partner thank-you notes (per-PARTNER cadence, set on the partner) ─────
  // Monthly cadence fires every run; quarterly fires on Jan/Apr/Jul/Oct 1st.
  // Metric-free by design — a warm note, never a scoreboard.
  for (const partner of partners) {
    if (!wantsThanks(partner)) continue;
    // Only thank partners who've actually referred someone, ever.
    if ((refsByPartner.get(partner.id) ?? []).length === 0) continue;

    const cadence = partner.thankyou_cadence ?? "off";
    const periodLabel = cadence === "quarterly" ? "this past quarter" : "this past month";
    const agentName = nameByAccount.get(partner.account_id) || "Your agent";
    const subject = `A thank-you from ${agentName} — ${monthLabel}`;
    if (partner.emails.some((e: string) => thankKeys.has(`${subject}|${e}`))) continue;

    const voice = voiceByAccount.get(partner.account_id);
    queue.push({
      kind: "thank_you",
      to: partner.emails,
      subject,
      html: voice?.email_thankyou
        ? plainBodyEmail(
            renderVoice(voice.email_thankyou, {
              partner: partner.name,
              period: periodLabel,
              agent: agentName,
            })
          )
        : thankYouEmail(partner.name, agentName, periodLabel),
    });
  }

  const result = await sendBatch(queue);

  return NextResponse.json(
    cronReport("monthly-summary", {
      month: monthLabel,
      partners: partners.length,
      summariesQueued,
      thanksQueued: queue.length - summariesQueued,
      sent: result.sent,
      failed: result.failed,
      truncated: partnerRead.truncated,
      secondsLeft: budget.secondsLeft,
      error: result.error,
      skipped,
    })
  );
}
