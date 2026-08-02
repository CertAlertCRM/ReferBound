import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plainBodyEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { Budget, cronGuard, cronReport, fetchAll, sendBatch, type BatchItem } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The expiring-policy watch. When a policy renews and the lender never gets an
// updated EOI, the servicer force-places coverage — three times the price, a
// furious client, and an agent who "didn't do anything wrong" except not send
// a document nobody asked for. This catches it 30 days out.
//
// Emails the AGENT, never the partner: the agent has to issue the renewal EOI
// before there's anything to deliver.
//
// Guarded by CRON_SECRET: GET /api/cron/renewals?secret=...

const WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const budget = new Budget(240);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  // Documents with a policy expiration inside the window.
  const docRead = await fetchAll<any>((from, to) =>
    db()
      .from("documents")
      .select(
        "id, kind, effective_end, referral_id, referrals(id, account_id, client_name, renewal_notified_at, status, partners(name))"
      )
      .in("kind", ["eoi", "dec"])
      .not("effective_end", "is", null)
      .gte("effective_end", today)
      .lte("effective_end", horizon)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (docRead.error) {
    return NextResponse.json(cronReport("renewals", { error: docRead.error }), { status: 500 });
  }

  // One row per referral, earliest expiration wins.
  const byReferral = new Map<
    string,
    { name: string; partner: string; expires: string; accountId: string }
  >();
  for (const d of docRead.rows) {
    const r = d.referrals;
    if (!r?.account_id) continue;
    if (!["bound", "docs_delivered"].includes(r.status)) continue;
    // Already nudged within the last 60 days? Stay quiet.
    if (r.renewal_notified_at && Date.now() - new Date(r.renewal_notified_at).getTime() < 60 * 86400000)
      continue;
    const existing = byReferral.get(r.id);
    if (!existing || d.effective_end < existing.expires) {
      byReferral.set(r.id, {
        name: r.client_name,
        partner: r.partners?.name ?? "their partner",
        expires: d.effective_end,
        accountId: r.account_id,
      });
    }
  }
  if (byReferral.size === 0) {
    return NextResponse.json(cronReport("renewals", { notified: 0, deals: 0 }));
  }

  // Group by account, respecting each agent's opt-out.
  const accountIds = Array.from(new Set(Array.from(byReferral.values()).map((v) => v.accountId)));
  const profByAccount = new Map<string, any>();
  const emailByAccount = new Map<string, string>();
  for (let i = 0; i < accountIds.length; i += 200) {
    const slice = accountIds.slice(i, i + 200);
    const { data: profiles } = await db()
      .from("agent_profile")
      .select("account_id, display_name, renewal_watch")
      .in("account_id", slice);
    for (const p of profiles ?? []) profByAccount.set(p.account_id, p);
    const { data: accounts } = await db().from("accounts").select("id, email").in("id", slice);
    for (const a of accounts ?? []) emailByAccount.set(a.id, a.email);
  }

  // Build the queue, remembering which referrals each message covers so the
  // "already nudged" stamp only lands on deals the agent was actually told
  // about. A batch that fails must be retryable tomorrow.
  const queue: BatchItem[] = [];
  const coveredByItem: string[][] = [];

  for (const accountId of accountIds) {
    const prof = profByAccount.get(accountId);
    if (prof && prof.renewal_watch === false) continue;
    const to = emailByAccount.get(accountId);
    if (!to) continue;

    const items = Array.from(byReferral.entries()).filter(([, v]) => v.accountId === accountId);
    if (!items.length) continue;

    const lines = items.map(([, v]) => `• ${v.name} — expires ${v.expires} (${v.partner})`).join("\n");

    queue.push({
      kind: "at_risk",
      to: [to],
      subject: `${items.length} polic${items.length === 1 ? "y" : "ies"} renewing soon — send updated proof of coverage`,
      html: plainBodyEmail(
        `These policies expire within the next ${WINDOW_DAYS} days:\n\n${lines}\n\n` +
          `If the lender doesn't receive updated evidence of insurance before the renewal date, ` +
          `the servicer can force-place coverage — expensive for the client and awkward for everyone.\n\n` +
          `Upload the renewal EOI to each deal and mark it delivered; their portal updates and the ` +
          `partner gets the new document automatically.\n\n${appUrl()}`
      ),
    });
    coveredByItem.push(items.map(([refId]) => refId));
  }

  const result = await sendBatch(queue);

  const stampedAt = new Date().toISOString();
  const toStamp: string[] = [];
  result.outcomes.forEach((err, i) => {
    if (err === null) toStamp.push(...(coveredByItem[i] ?? []));
  });
  for (let i = 0; i < toStamp.length; i += 200) {
    await db()
      .from("referrals")
      .update({ renewal_notified_at: stampedAt })
      .in("id", toStamp.slice(i, i + 200));
  }

  return NextResponse.json(
    cronReport("renewals", {
      notified: result.sent,
      deals: byReferral.size,
      stamped: toStamp.length,
      failed: result.failed,
      truncated: docRead.truncated,
      secondsLeft: budget.secondsLeft,
      error: result.error,
    })
  );
}
