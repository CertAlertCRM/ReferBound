import { db } from "@/lib/db";
import { currentAccountId } from "@/lib/session";

export type Account = {
  id: string;
  email: string;
  display_name: string | null;
  plan: string;
  stripe_customer_id: string | null;
  subscription_status: string | null;
};

// The signed-in account, or null. Route handlers should 401 on null
// (the middleware already blocks unauthenticated page/API access, so null
// here mainly means a stale cookie).
export async function getAccount(): Promise<Account | null> {
  const id = currentAccountId();
  if (!id) return null;
  const { data } = await db()
    .from("accounts")
    .select("id, email, display_name, plan, stripe_customer_id, subscription_status")
    .eq("id", id)
    .maybeSingle();
  return (data as Account) ?? null;
}

// Ownership check: a referral that belongs to this account, or null.
export async function ownedReferral(accountId: string, referralId: string, select = "id") {
  const { data } = await db()
    .from("referrals")
    .select(select)
    .eq("id", referralId)
    .eq("account_id", accountId)
    .maybeSingle();
  return data as any;
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  agency: "Agency",
};

// Free tier: full features, one partner. Pro/Agency: unlimited partners.
export function partnerLimit(plan: string): number | null {
  return plan === "free" ? 1 : null;
}
