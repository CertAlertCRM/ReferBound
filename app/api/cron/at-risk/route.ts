import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AT_RISK_DAYS, SAFE_STATUSES, STATUS_LABELS } from "@/lib/config";
import { sendEmail, atRiskEmail, agentDigestEmail } from "@/lib/email";
import { appUrl, fmtDate } from "@/lib/helpers";
import { logActivity } from "@/lib/activity";

// Daily check across ALL accounts:
//  1) referrals closing within AT_RISK_DAYS and not bound → alert partner + owning agent
//  2) per-account digest: stale referrals + closing-soon → the account's email
// Folded into one cron (Vercel Hobby allows max 2 cron jobs). Guarded by CRON_SECRET.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (secret && auth !== `Bearer ${secret}` && qs !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + AT_RISK_DAYS * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const since = new Date(today).toISOString();

  // Account emails, once.
  const { data: accounts } = await db().from("accounts").select("id, email");
  const emailByAccount = new Map((accounts ?? []).map((a) => [a.id, a.email]));

  const { data: atRisk, error } = await db()
    .from("referrals")
    .select("id, client_name, closing_date, status, account_id, partners(name, token, emails)")
    .not("closing_date", "is", null)
    .gte("closing_date", iso(today))
    .lte("closing_date", iso(horizon))
    .not("status", "in", `(${[...SAFE_STATUSES, "lost"].join(",")})`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const r of atRisk ?? []) {
    const { data: existing } = await db()
      .from("email_log")
      .select("id")
      .eq("referral_id", r.id)
      .eq("kind", "at_risk")
      .gte("created_at", since)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const partner = (r as any).partners;
    const ownerEmail = emailByAccount.get((r as any).account_id);
    const portalUrl = `${appUrl()}/p/${partner?.token}`;
    const recipients = [...(partner?.emails ?? []), ...(ownerEmail ? [ownerEmail] : [])];
    await sendEmail({
      referralId: r.id,
      kind: "at_risk",
      to: recipients,
      subject: `⚠ ${r.client_name} closes ${fmtDate(r.closing_date)} — insurance not bound`,
      html: atRiskEmail(r.client_name, fmtDate(r.closing_date), r.status, portalUrl),
    });
    await logActivity(
      r.id,
      "at_risk_flagged",
      `Flagged at-risk: closes ${fmtDate(r.closing_date)}, not yet bound`,
      "system"
    );
    sent++;
  }

  // ── Per-account daily digest ───────────────────────────────────────────────
  let digestsSent = 0;
  const { data: dupe } = await db()
    .from("email_log")
    .select("id")
    .eq("kind", "agent_digest")
    .gte("created_at", since)
    .limit(1);

  if (!dupe || dupe.length === 0) {
    const staleCutoff = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: staleRefs } = await db()
      .from("referrals")
      .select("client_name, status, updated_at, account_id")
      .not("status", "in", `(${[...SAFE_STATUSES, "lost"].join(",")})`)
      .lt("updated_at", staleCutoff);

    const byAccount = new Map<string, { stale: any[]; closing: any[] }>();
    const bucket = (id: string) => {
      if (!byAccount.has(id)) byAccount.set(id, { stale: [], closing: [] });
      return byAccount.get(id)!;
    };
    for (const r of staleRefs ?? []) {
      if (!r.account_id) continue;
      bucket(r.account_id).stale.push({
        name: r.client_name,
        status: STATUS_LABELS[r.status] ?? r.status,
        days: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000),
      });
    }
    for (const r of atRisk ?? []) {
      const aid = (r as any).account_id;
      if (!aid) continue;
      bucket(aid).closing.push({
        name: r.client_name,
        closing: fmtDate(r.closing_date),
        status: STATUS_LABELS[r.status] ?? r.status,
      });
    }

    for (const [accountId, items] of byAccount) {
      const email = emailByAccount.get(accountId);
      if (!email || (items.stale.length === 0 && items.closing.length === 0)) continue;
      await sendEmail({
        kind: "agent_digest",
        to: [email],
        subject: `ReferBound check: ${items.closing.length} closing soon, ${items.stale.length} need a touch`,
        html: agentDigestEmail(items.stale, items.closing, appUrl()),
      });
      digestsSent++;
    }
  }

  return NextResponse.json({ checked: atRisk?.length ?? 0, alerted: sent, digestsSent });
}
