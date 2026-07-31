import { db } from "@/lib/db";

// Agent referral program. Rewards are granted as Pro *time*, never a plan
// change — so a free account unlocks Pro, a monthly subscriber gets a window
// they aren't charged for, and an annual founder's renewal effectively moves
// out. When the window lapses, everyone lands exactly where they started.

export const REFERRER_MONTHS = 3;
export const WELCOME_MONTHS = 1;

// Extend from whichever is later: now, or an existing unexpired window. Two
// rewards in the same month stack instead of overwriting each other.
export async function grantProMonths(accountId: string, months: number): Promise<string | null> {
  const { data: acct } = await db().from("accounts").select("pro_until").eq("id", accountId).maybeSingle();
  if (!acct) return null;
  const base =
    acct.pro_until && new Date(acct.pro_until).getTime() > Date.now()
      ? new Date(acct.pro_until)
      : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + months);
  const iso = until.toISOString();
  await db().from("accounts").update({ pro_until: iso }).eq("id", accountId);
  return iso;
}

// Called after a referred agent does something real. Deliberately NOT on
// signup: paying for empty accounts is how referral programs rot.
// The unique constraint on referral_rewards makes this safe to call often.
export async function maybeRewardReferrer(referredAccountId: string): Promise<boolean> {
  try {
    const { data: acct } = await db()
      .from("accounts")
      .select("id, referred_by")
      .eq("id", referredAccountId)
      .maybeSingle();
    if (!acct?.referred_by || acct.referred_by === acct.id) return false;

    // Earned Pro months only mean something to a free account. Paying accounts
    // — including anyone on a custom or founding rate — already hold their
    // thank-you in the price they pay, so nothing accrues to them. Their
    // referrals still land with the welcome month; that half is activation.
    const { data: referrer } = await db()
      .from("accounts")
      .select("plan")
      .eq("id", acct.referred_by)
      .maybeSingle();
    if (!referrer || referrer.plan !== "free") return false;

    // Already paid for this pairing?
    const { data: existing } = await db()
      .from("referral_rewards")
      .select("id")
      .eq("account_id", acct.referred_by)
      .eq("referred_account_id", acct.id)
      .eq("kind", "referrer")
      .maybeSingle();
    if (existing) return false;

    // Activation bar: a partner AND a referral logged. A signup alone earns
    // nothing — the reward tracks real use, not a filled-in form.
    const [{ count: partners }, { count: refs }] = await Promise.all([
      db().from("partners").select("id", { count: "exact", head: true }).eq("account_id", acct.id),
      db().from("referrals").select("id", { count: "exact", head: true }).eq("account_id", acct.id),
    ]);
    if (!partners || !refs) return false;

    const { error } = await db().from("referral_rewards").insert({
      account_id: acct.referred_by,
      referred_account_id: acct.id,
      months: REFERRER_MONTHS,
      kind: "referrer",
    });
    if (error) return false; // race lost to a concurrent grant — fine

    await grantProMonths(acct.referred_by, REFERRER_MONTHS);
    return true;
  } catch (e) {
    console.error("referral reward failed", e);
    return false;
  }
}

export function daysLeft(proUntil: string | null | undefined): number | null {
  if (!proUntil) return null;
  const ms = new Date(proUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : null;
}
