import { db } from "@/lib/db";
import { currentAccountId } from "@/lib/session";

export type Account = {
  // The DATA account id — for team members this is the agency OWNER's id, so
  // every existing `.eq("account_id", account.id)` filter automatically shares
  // the owner's partners, referrals, and profile with the whole team.
  id: string;
  // The signed-in account's own id (differs from `id` only for team members).
  selfId: string;
  email: string; // the signed-in user's own email
  display_name: string | null;
  plan: string; // effective plan (the owner's plan for team members)
  stripe_customer_id: string | null;
  subscription_status: string | null;
  isTeamMember: boolean;
  ownerEmail: string | null; // set for team members
  // Referral-earned Pro: an end date, not a plan change. Their real plan is
  // untouched, so when the window lapses they land exactly where they were.
  proUntil: string | null;
  earnedPro: boolean;
};

// Pro earned through referrals (or a welcome window) still counts as Pro for
// every feature gate — partner limits, team seats stay Agency-only.
function effectivePlan(plan: string, proUntil: string | null): string {
  if (plan !== "free") return plan;
  if (proUntil && new Date(proUntil).getTime() > Date.now()) return "pro";
  return plan;
}

// The signed-in account, or null. Route handlers should 401 on null
// (the middleware already blocks unauthenticated page/API access, so null
// here mainly means a stale cookie).
export async function getAccount(): Promise<Account | null> {
  const id = currentAccountId();
  if (!id) return null;
  const { data: self } = await db()
    .from("accounts")
    .select("id, email, display_name, plan, stripe_customer_id, subscription_status, team_owner_id, pro_until")
    .eq("id", id)
    .maybeSingle();
  if (!self) return null;

  if (self.team_owner_id) {
    const { data: owner } = await db()
      .from("accounts")
      .select("id, email, plan, stripe_customer_id, subscription_status, pro_until")
      .eq("id", self.team_owner_id)
      .maybeSingle();
    if (owner) {
      return {
        id: owner.id,
        selfId: self.id,
        email: self.email,
        display_name: self.display_name,
        plan: effectivePlan(owner.plan, owner.pro_until),
        stripe_customer_id: owner.stripe_customer_id,
        subscription_status: owner.subscription_status,
        isTeamMember: true,
        ownerEmail: owner.email,
        proUntil: owner.pro_until ?? null,
        earnedPro: owner.plan === "free" && effectivePlan(owner.plan, owner.pro_until) === "pro",
      };
    }
    // Owner row missing shouldn't happen (FK cascade) — fall through as solo.
  }

  const plan = effectivePlan(self.plan, self.pro_until);
  return {
    id: self.id,
    selfId: self.id,
    email: self.email,
    display_name: self.display_name,
    plan,
    stripe_customer_id: self.stripe_customer_id,
    subscription_status: self.subscription_status,
    isTeamMember: false,
    ownerEmail: null,
    proUntil: self.pro_until ?? null,
    earnedPro: self.plan === "free" && plan === "pro",
  };
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

// Agency plan: one owner + teammates, 7 users total.
export const TEAM_SEAT_LIMIT = 7;
