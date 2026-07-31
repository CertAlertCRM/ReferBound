import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, PLAN_LABELS } from "@/lib/account";

// Agent-only: current plan + the Stripe Payment Link URLs with this account's
// id and email attached, so the webhook can activate the right account.

// The plan key rides along in client_reference_id ("<accountId>_agency") so the
// webhook never has to guess the plan from the price — which is what makes
// discounted and custom-priced links safe.
function withParams(
  link: string | undefined,
  accountId: string,
  email: string,
  planKey: "pro" | "agency" | "founder"
): string | null {
  if (!link) return null;
  const sep = link.includes("?") ? "&" : "?";
  return `${link}${sep}client_reference_id=${encodeURIComponent(`${accountId}_${planKey}`)}&prefilled_email=${encodeURIComponent(email)}`;
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Team members don't manage billing — their plan rides on the owner's.
  if (account.isTeamMember) {
    return NextResponse.json({
      plan: account.plan,
      planLabel: PLAN_LABELS[account.plan] ?? account.plan,
      email: account.email,
      subscriptionStatus: account.subscription_status,
      managed: true,
      ownerEmail: account.ownerEmail,
      billingInterval: "monthly",
      links: { pro: null, agency: null, founder: null, portal: null },
    });
  }

  // Monthly vs annual (Founder Annual) — set by the Stripe webhook.
  const { data: row } = await db()
    .from("accounts")
    .select("billing_interval")
    .eq("id", account.id)
    .maybeSingle();

  return NextResponse.json({
    plan: account.plan,
    planLabel: account.earnedPro ? "Pro (earned)" : PLAN_LABELS[account.plan] ?? account.plan,
    earnedPro: account.earnedPro,
    proUntil: account.proUntil,
    email: account.email,
    subscriptionStatus: account.subscription_status,
    managed: false,
    ownerEmail: null,
    billingInterval: row?.billing_interval ?? "monthly",
    links: {
      pro: withParams(process.env.NEXT_PUBLIC_STRIPE_LINK_PRO, account.id, account.email, "pro"),
      agency: withParams(process.env.NEXT_PUBLIC_STRIPE_LINK_AGENCY, account.id, account.email, "agency"),
      founder: withParams(process.env.NEXT_PUBLIC_STRIPE_LINK_FOUNDER, account.id, account.email, "founder"),
      portal: process.env.NEXT_PUBLIC_STRIPE_PORTAL_LINK ?? null,
    },
  });
}
