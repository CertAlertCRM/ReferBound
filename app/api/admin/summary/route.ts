import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

// Founder-only business dashboard. Gated to ADMIN_EMAIL (falls back to
// AGENT_EMAIL). ?ping=1 is a cheap authorization check the nav uses to decide
// whether to show the Admin button at all.

const PLAN_PRICE: Record<string, number> = { free: 0, pro: 20, agency: 99 };
// Founder Annual: $199/yr, counted as monthly-equivalent revenue in MRR.
const FOUNDER_ANNUAL_PRICE = 199;

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
      s.from("accounts").select("id, email, plan, billing_interval, plan_amount_cents, created_at, team_owner_id, stripe_subscription_id, referred_by, pro_until, signup_source"),
      s.from("partners").select("id, account_id, partner_type"),
      s.from("referrals").select("id, account_id, status, premium, created_at, source, backfilled"),
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
  const founderAnnual = paying.filter((a) => a.billing_interval === "annual").length;
  // Real money, not list price: use what Stripe actually charged when we have
  // it, so discounted plans and annual terms report honestly. List price is
  // the fallback for accounts set by hand before this existed.
  const monthlyValue = (a: any): number => {
    const cents = a.plan_amount_cents;
    if (typeof cents === "number" && cents > 0) {
      return a.billing_interval === "annual" ? cents / 100 / 12 : cents / 100;
    }
    return a.billing_interval === "annual" ? FOUNDER_ANNUAL_PRICE / 12 : PLAN_PRICE[a.plan] ?? 0;
  };
  const mrr = Math.round(paying.reduce((sum, a) => sum + monthlyValue(a), 0));
  const discounted = paying.filter(
    (a) =>
      typeof a.plan_amount_cents === "number" &&
      a.billing_interval !== "annual" &&
      a.plan_amount_cents / 100 < (PLAN_PRICE[a.plan] ?? 0)
  ).length;
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
      annual: a.billing_interval === "annual",
      isMember: Boolean(a.team_owner_id),
      partners: partnersByAccount.get(a.id) ?? 0,
      referrals: refsByAccount.get(a.id)?.total ?? 0,
      bound: refsByAccount.get(a.id)?.bound ?? 0,
      created_at: String(a.created_at).slice(0, 10),
    }))
    .sort((x, y) => y.created_at.localeCompare(x.created_at));

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentEmails = ems.filter((e) => e.created_at >= since30);

  // Imported history is real business but wasn't produced through the product —
  // it never counts toward the founder view of what ReferBound generated.
  const liveRefs = refs.filter((r) => !r.backfilled);
  const premiumTracked = liveRefs
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
      founderAnnual,
      discounted,
      // How much of the base came from agents referring agents — the number
      // that tells you whether this thing spreads on its own yet.
      viaReferral: accts.filter((a) => a.referred_by).length,
      // Channel mix — the lender number is the one that says whether this
      // spreads through the referral network or only through your calendar.
      bySource: accts.reduce((acc: Record<string, number>, a) => {
        const k = a.signup_source ?? "unknown";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
      onEarnedPro: accts.filter(
        (a) => a.plan === "free" && a.pro_until && new Date(a.pro_until).getTime() > Date.now()
      ).length,
      mrr,
      partners: parts.length,
      referrals: liveRefs.length,
      backfilled: refs.length - liveRefs.length,
      fromPortal: liveRefs.filter((r) => r.source === "partner").length,
      bound: liveRefs.filter((r) => ["bound", "docs_delivered"].includes(r.status)).length,
      premiumTracked: Math.round(premiumTracked),
      emailsSent30d: recentEmails.filter((e) => e.sent).length,
      emailsFailed30d: recentEmails.filter((e) => !e.sent).length,
      feedback30d: recentEmails.filter((e) => e.kind === "feedback" && e.sent).length,
    },
    signups14d: days,
    accounts: accountRows,
  });
}
