import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AT_RISK_DAYS, SAFE_STATUSES, STATUS_LABELS } from "@/lib/config";
import { atRiskEmail, agentDigestEmail, partnerClosingsEmail } from "@/lib/email";
import { appUrl, fmtDate } from "@/lib/helpers";
import { Budget, cronGuard, cronReport, fetchAll, sendBatch, type BatchItem } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily check across ALL accounts:
//  1) referrals closing within AT_RISK_DAYS and not bound → alert partner + owning agent
//  2) per-account digest: stale referrals + closing-soon → the account's email
//  3) on Mondays, a per-partner two-week closings digest
//
// Everything here is collect-then-send. The old shape did a dedupe query and
// a Resend call per referral, one after another, which put a hard ceiling of
// roughly 150 messages on a run — reached at about forty active agents, and
// reached silently. Now the dedupe history is three queries regardless of
// size and the sending is one API call per hundred messages.

export async function GET(req: NextRequest) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const budget = new Budget(240);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + AT_RISK_DAYS * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const since = new Date(today).toISOString();

  const { data: accounts } = await db().from("accounts").select("id, email");
  const emailByAccount = new Map<string, string>(
    ((accounts ?? []) as any[]).map((a) => [String(a.id), String(a.email ?? "")])
  );

  const atRiskRead = await fetchAll<any>((from, to) =>
    db()
      .from("referrals")
      .select(
        "id, client_name, closing_date, status, account_id, partners(name, token, emails), partner_contacts(email)"
      )
      .not("closing_date", "is", null)
      .gte("closing_date", iso(today))
      .lte("closing_date", iso(horizon))
      .not("status", "in", `(${[...SAFE_STATUSES, "lost"].join(",")})`)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (atRiskRead.error) {
    return NextResponse.json(cronReport("at-risk", { error: atRiskRead.error }), { status: 500 });
  }
  const atRisk = atRiskRead.rows;

  const queue: BatchItem[] = [];
  const flagged: string[] = [];

  // ── 1. At-risk alerts ─────────────────────────────────────────────────────
  // One dedupe query for the whole run. Referral ids are chunked because a
  // PostgREST `in` list travels in the URL and a few thousand ids overflow it.
  const alreadyAlerted = new Set<string>();
  const ids = atRisk.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db()
      .from("email_log")
      .select("referral_id")
      .in("referral_id", ids.slice(i, i + 200))
      .eq("kind", "at_risk")
      .gte("created_at", since);
    for (const row of data ?? []) if (row.referral_id) alreadyAlerted.add(row.referral_id);
  }

  for (const r of atRisk) {
    if (alreadyAlerted.has(r.id)) continue;
    const partner = r.partners;
    const ownerEmail = emailByAccount.get(r.account_id);
    const portalUrl = `${appUrl()}/p/${partner?.token}`;
    // The sender of this lead (if known) + the agent — not the whole team.
    const partnerSide: string[] = r.partner_contacts?.email
      ? [r.partner_contacts.email]
      : (partner?.emails ?? []);
    const recipients = [...partnerSide, ...(ownerEmail ? [ownerEmail] : [])];
    if (recipients.filter(Boolean).length === 0) continue;
    queue.push({
      referralId: r.id,
      kind: "at_risk",
      to: recipients,
      subject: `⚠ ${r.client_name} closes ${fmtDate(r.closing_date)} — insurance not bound`,
      html: atRiskEmail(r.client_name, fmtDate(r.closing_date), r.status, portalUrl),
    });
    flagged.push(r.id);
  }

  // ── 2. Per-account daily digest ───────────────────────────────────────────
  // The dedupe used to ask "has ANY agent_digest gone out today?" and skip the
  // entire block if one had. That meant a run which died halfway through the
  // digests could never be retried — the second attempt saw the first
  // account's log row and stopped. It's per-account now.
  let digestsQueued = 0;
  if (!budget.expired) {
    const { data: sentToday } = await db()
      .from("email_log")
      .select("recipients")
      .eq("kind", "agent_digest")
      .gte("created_at", since);
    const digestedEmails = new Set<string>();
    for (const row of sentToday ?? []) {
      for (const addr of (row.recipients as string[]) ?? []) digestedEmails.add(addr);
    }

    const staleCutoff = new Date(Date.now() - 3 * 86400000).toISOString();
    const staleRead = await fetchAll<any>((from, to) =>
      db()
        .from("referrals")
        .select("client_name, status, updated_at, account_id")
        .not("status", "in", `(${[...SAFE_STATUSES, "lost"].join(",")})`)
        .lt("updated_at", staleCutoff)
        .order("account_id", { ascending: true })
        .range(from, to)
    );

    const byAccount = new Map<string, { stale: any[]; closing: any[] }>();
    const bucket = (id: string) => {
      if (!byAccount.has(id)) byAccount.set(id, { stale: [], closing: [] });
      return byAccount.get(id)!;
    };
    for (const r of staleRead.rows) {
      if (!r.account_id) continue;
      bucket(r.account_id).stale.push({
        name: r.client_name,
        status: STATUS_LABELS[r.status] ?? r.status,
        days: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000),
      });
    }
    for (const r of atRisk) {
      if (!r.account_id) continue;
      bucket(r.account_id).closing.push({
        name: r.client_name,
        closing: fmtDate(r.closing_date),
        status: STATUS_LABELS[r.status] ?? r.status,
      });
    }

    for (const [accountId, items] of byAccount) {
      const email = emailByAccount.get(accountId);
      if (!email || digestedEmails.has(email)) continue;
      if (items.stale.length === 0 && items.closing.length === 0) continue;
      queue.push({
        kind: "agent_digest",
        to: [email],
        subject: `ReferBound check: ${items.closing.length} closing soon, ${items.stale.length} need a touch`,
        html: agentDigestEmail(items.stale, items.closing, appUrl()),
      });
      digestsQueued++;
    }
  }

  // ── 3. Monday partner closings digest (next 14 days, per partner) ─────────
  // The email a processor forwards around the office: everything closing in
  // the next two weeks with insurance status at a glance. Quiet if nothing
  // is closing.
  let closingsQueued = 0;
  if (new Date().getUTCDay() === 1 && !budget.expired) {
    const horizon14 = new Date(today.getTime() + 14 * 86400000);
    const closingRead = await fetchAll<any>((from, to) =>
      db()
        .from("referrals")
        .select("id, client_name, closing_date, status, partner_id, partners(name, token, emails)")
        .not("closing_date", "is", null)
        .gte("closing_date", iso(today))
        .lte("closing_date", iso(horizon14))
        .neq("status", "lost")
        .order("partner_id", { ascending: true })
        .range(from, to)
    );

    const { data: closingsSent } = await db()
      .from("email_log")
      .select("recipients")
      .eq("kind", "partner_closings")
      .gte("created_at", since);
    const alreadyDigested = new Set<string>();
    for (const row of closingsSent ?? []) {
      for (const addr of (row.recipients as string[]) ?? []) alreadyDigested.add(addr);
    }

    const byPartner = new Map<string, { partner: any; items: any[] }>();
    for (const r of closingRead.rows) {
      const partner = r.partners;
      if (!partner?.emails?.length) continue;
      const key = r.partner_id;
      if (!byPartner.has(key)) byPartner.set(key, { partner, items: [] });
      byPartner.get(key)!.items.push({
        name: r.client_name,
        closing: fmtDate(r.closing_date),
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        done: SAFE_STATUSES.includes(r.status),
      });
    }

    for (const { partner, items } of byPartner.values()) {
      if (partner.emails.some((e: string) => alreadyDigested.has(e))) continue;
      queue.push({
        kind: "partner_closings",
        to: partner.emails,
        subject: `Your closings this week — ${items.length} with insurance status`,
        html: partnerClosingsEmail(partner.name, items, `${appUrl()}/p/${partner.token}`),
      });
      closingsQueued++;
    }
  }

  const result = await sendBatch(queue);

  // The at-risk timeline entry is written only for messages that actually
  // went out, so a failed send doesn't leave a "flagged" note on a deal
  // nobody was told about.
  if (result.sent > 0 && flagged.length > 0 && result.failed === 0) {
    const rows = atRisk
      .filter((r) => flagged.includes(r.id))
      .map((r) => ({
        referral_id: r.id,
        event_type: "at_risk_flagged",
        detail: `Flagged at-risk: closes ${fmtDate(r.closing_date)}, not yet bound`,
        actor: "system",
      }));
    for (let i = 0; i < rows.length; i += 500) {
      await db().from("activity_log").insert(rows.slice(i, i + 500));
    }
  }

  return NextResponse.json(
    cronReport("at-risk", {
      checked: atRisk.length,
      queued: queue.length,
      alerted: flagged.length,
      digestsQueued,
      closingsQueued,
      sent: result.sent,
      failed: result.failed,
      truncated: atRiskRead.truncated,
      secondsLeft: budget.secondsLeft,
      error: result.error,
    })
  );
}
