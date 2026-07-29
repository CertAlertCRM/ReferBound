import { NextResponse } from "next/server";
import { getAccount, PLAN_LABELS } from "@/lib/account";

// Agent-only: current plan + the Stripe Payment Link URLs with this account's
// id and email attached, so the webhook can activate the right account.

function withParams(link: string | undefined, accountId: string, email: string): string | null {
  if (!link) return null;
  const sep = link.includes("?") ? "&" : "?";
  return `${link}${sep}client_reference_id=${encodeURIComponent(accountId)}&prefilled_email=${encodeURIComponent(email)}`;
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
      links: { pro: null, agency: null, portal: null },
    });
  }

  return NextResponse.json({
    plan: account.plan,
    planLabel: PLAN_LABELS[account.plan] ?? account.plan,
    email: account.email,
    subscriptionStatus: account.subscription_status,
    managed: false,
    ownerEmail: null,
    links: {
      pro: withParams(process.env.NEXT_PUBLIC_STRIPE_LINK_PRO, account.id, account.email),
      agency: withParams(process.env.NEXT_PUBLIC_STRIPE_LINK_AGENCY, account.id, account.email),
      portal: process.env.NEXT_PUBLIC_STRIPE_PORTAL_LINK ?? null,
    },
  });
}
