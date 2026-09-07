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
  // Signed up before the paid-source and ledger gates existed. The first
  // people to trust an unfinished product do not get their tools taken away
  // to make a pricing page work.
  legacy: boolean;
};

// Accounts created before this instant keep the old, wider free tier forever.
export const LEGACY_BEFORE = "2026-09-08T00:00:00.000Z";

// Fails OPEN. If we cannot tell when an account was created, it is treated as
// legacy and nothing is gated. A pricing flag must never be the reason someone
// loses access to their own book — being unable to charge is a smaller problem
// than being unable to sign in.
function isLegacy(createdAt: string | null | undefined): boolean {
  if (!createdAt) return true;
  return createdAt < LEGACY_BEFORE;
}

const ACCOUNT_COLS =
  "id, email, display_name, plan, stripe_customer_id, subscription_status, team_owner_id, pro_until";

// Read an account, tolerating a database that does not have created_at.
//
// The hard lesson behind this: adding one column to this select put it on the
// authentication path for every request in the product. If the column is not
// there, the select fails, this returns null, and every API in the app answers
// 401 — which looks exactly like all of a user's data disappearing. Nothing
// needed for a plan gate is worth that, so the gating column is optional and
// its absence costs only the gate.
async function readAccount(id: string): Promise<any | null> {
  const { data, error } = await db()
    .from("accounts")
    .select(`${ACCOUNT_COLS}, created_at`)
    .eq("id", id)
    .maybeSingle();
  if (!error) return data;
  console.error("accounts select with created_at failed, retrying without:", error.message);
  const { data: fallback } = await db()
    .from("accounts")
    .select(ACCOUNT_COLS)
    .eq("id", id)
    .maybeSingle();
  return fallback ? { ...fallback, created_at: null } : null;
}

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
  const self = await readAccount(id);
  if (!self) return null;

  if (self.team_owner_id) {
    const owner = await readAccount(self.team_owner_id);
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
        legacy: isLegacy(owner.created_at),
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
    legacy: isLegacy(self.created_at),
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

// Free tier: full features, one lender plus a couple of other referral sources.
//
// The lender relationship is the wall on purpose — it's where the product earns
// its keep, and where a second one is worth paying for. Realtors, CPAs, and the
// friend who keeps sending people are how a new agent gets far enough to find
// that out, so free leaves room for a few of those.
export const FREE_LENDER_LIMIT = 1;
export const FREE_OTHER_LIMIT = 2;

// One lead vendor on free. An agency running EverQuote and Quote Wizard and
// SmartFinancial at the same time is spending thousands a month; the second
// vendor is an honest signal that the money is there. Nothing is taken away —
// a single source still gets the queue, the asks, and earned share.
export const FREE_PAID_LIMIT = 1;

export async function paidSourceCapacity(
  accountId: string,
  plan: string,
  legacy: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (plan !== "free" || legacy) return { ok: true };
  const { count } = await db()
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("source_kind", "paid");
  if ((count ?? 0) < FREE_PAID_LIMIT) return { ok: true };
  return {
    ok: false,
    error:
      "Free tracks one lead source. Pro adds the rest — and the ledger that tells you what each one actually costs per policy.",
  };
}

export function partnerLimits(plan: string): { lender: number | null; other: number | null } {
  return plan === "free"
    ? { lender: FREE_LENDER_LIMIT, other: FREE_OTHER_LIMIT }
    : { lender: null, other: null };
}

// The one place every create path asks "can this agent add this partner?" —
// counted by kind, because the lender seat is the one that's worth money.
export async function partnerCapacity(
  accountId: string,
  plan: string,
  partnerType: string,
  countFn: (isLender: boolean) => Promise<number>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limits = partnerLimits(plan);
  const lender = isLenderType(partnerType);
  const cap = lender ? limits.lender : limits.other;
  if (cap === null) return { ok: true };
  const used = await countFn(lender);
  if (used < cap) return { ok: true };
  return {
    ok: false,
    error: lender
      ? "Free includes one lender partner. Pro adds unlimited lenders, processors, and everyone else."
      : `Free includes up to ${cap} non-lender referral partners. Pro removes the limit.`,
  };
}

export function isLenderType(partnerType?: string | null): boolean {
  return (partnerType ?? "lender") === "lender";
}

// Count an account's partners on one side of the lender line.
//
// Only portal-bearing sources count. The cap is about portals — the thing the
// plan actually sells — and a lead vendor or a referring client has none. If
// client sources counted here, logging your third word-of-mouth deal would
// quietly use up the seat meant for a realtor, which is the opposite of what
// the free tier is for.
export function countPartners(accountId: string) {
  return async (lender: boolean) => {
    const q = db()
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("source_kind", "partner");
    const { count } = await (lender ? q.eq("partner_type", "lender") : q.neq("partner_type", "lender"));
    return count ?? 0;
  };
}

// Kept for the older call sites that only ask "is there any cap at all".
export function partnerLimit(plan: string): number | null {
  return plan === "free" ? FREE_LENDER_LIMIT + FREE_OTHER_LIMIT : null;
}

// Agency plan: one owner + teammates, 7 users total.
export const TEAM_SEAT_LIMIT = 7;
