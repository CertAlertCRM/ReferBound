import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

// Founder-only business dashboard. Gated to ADMIN_EMAIL (falls back to
// AGENT_EMAIL). ?ping=1 is a cheap authorization check the nav uses to decide
// whether to show the Admin button at all.

const PLAN_PRICE: Record<string, number> = { free: 0, pro: 20, agency: 99 };

function isAdmin(email: string): boolean {
  const admin = (process.env.ADMIN_EMAIL || process.env.AGENT_EMAIL || "").toLowerCase();
  return admin.length > 0 && email.toLowerCase() === admin;
}

export async function GET(req: NextRequest) {
  const account = await getAccount();
  if (!account || !isAdmin(account.email)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }
  if (req.nextUrl.searchParams.get("ping")) return NextResponse.json({ ok: true });

  const s = db();
  const [{ data: accounts }, { data: partners }, { data: referrals }, { data: emails }] =
    await Promise.all([
      s.from("accounts").select("id, email, plan, created_at, team_owner_id, stripe_subscription_id"),
      s.from("partners").select("id, account_id, partner_type"),
      s.from("referrals").select("id, account_id, status, premium, created_at, source"),
      s.from("email_log").select("kind, sent, created_at"),
    ]);

  const accts = accounts ?? [];
  const parts = partners ?? [];
  const refs = referrals ?? [];
  const ems = emails ?? [];

  // Revenue: count owners by plan (members ride on the owner's plan).
  const owners = accts.filter((a) => !a.team_owner_id);
  const byPlan: Record<string, number> = { free: 0, pro: 0, agency: 0 };
  for (const a of owners) byPlan[a.plan] = (byPlan[a.plan] ?? 0) + 1;
  const paying = owners.filter((a) => (PLAN_PRICE[a.plan] ?? 0) > 0);
  const mrr = paying.reduce((sum, a) => sum + (PLAN_PRICE[a.plan] ?? 0), 0);
  const viaStripe = paying.filter((a) => a.stripe_subscription_id).length;

  // Signups per day, last 14 days (UTC).
  const days: { label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    days.push({
      label: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" }),
      count: accts.filter((a) => String(a.created_at).slice(0, 10) === key).length,
    });
  }

  // Per-account rollup for the table.
  const partnersByAccount = new Map<string, number>();
  for (const p of parts) {
    if (p.account_id) partnersByAccount.set(p.account_id, (partnersByAccount.get(p.account_id) ?? 0) + 1);
  }
  const refsByAccount = new Map<string, { total: number; bound: number }>();
  for (const r of refs) {
    if (!r.account_id) continue;
    const row = refsByAccount.get(r.account_id) ?? { total: 0, bound: 0 };
    row.total++;
    if (["bound", "docs_delivered"].includes(r.status)) row.bound++;
    refsByAccount.set(r.account_id, row);
  }
  const accountRows = accts
    .map((a) => ({
      email: a.email,
      plan: a.plan,
      isMember: Boolean(a.team_owner_id),
      partners: partnersByAccount.get(a.id) ?? 0,
      referrals: refsByAccount.get(a.id)?.total ?? 0,
      bound: refsByAccount.get(a.id)?.bound ?? 0,
      created_at: String(a.created_at).slice(0, 10),
    }))
    .sort((x, y) => y.created_at.localeCompare(x.created_at));

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentEmails = ems.filter((e) => e.created_at >= since30);

  const premiumTracked = refs
    .filter((r) => ["bound", "docs_delivered"].includes(r.status) && typeof r.premium === "number")
    .reduce((a, r) => a + (r.premium as number), 0);

  return NextResponse.json({
    totals: {
      accounts: accts.length,
      owners: owners.length,
      teamMembers: accts.length - owners.length,
      byPlan,
      paying: paying.length,
      viaStripe,
      mrr,
      partners: parts.length,
      referrals: refs.length,
      fromPortal: refs.filter((r) => r.source === "partner").length,
      bound: refs.filter((r) => ["bound", "docs_delivered"].includes(r.status)).length,
      premiumTracked: Math.round(premiumTracked),
      emailsSent30d: recentEmails.filter((e) => e.sent).length,
      emailsFailed30d: recentEmails.filter((e) => !e.sent).length,
      feedback30d: recentEmails.filter((e) => e.kind === "feedback" && e.sent).length,
    },
    signups14d: days,
    accounts: accountRows,
  });
}
