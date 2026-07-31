import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { appUrl } from "@/lib/helpers";
import { REFERRER_MONTHS, WELCOME_MONTHS, daysLeft } from "@/lib/referral";

export const dynamic = "force-dynamic";

// The agent's referral standing: their link, who they've brought in, what
// they've earned, and what's still pending activation.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Team members share a plan; referrals belong to the owner account.
  if (account.isTeamMember) {
    return NextResponse.json({ managed: true, ownerEmail: account.ownerEmail });
  }

  const { data: me } = await db()
    .from("accounts")
    .select("referral_code, pro_until")
    .eq("id", account.id)
    .maybeSingle();

  const { data: invited } = await db()
    .from("accounts")
    .select("id, email, display_name, created_at")
    .eq("referred_by", account.id)
    .order("created_at", { ascending: false });

  const ids = (invited ?? []).map((a) => a.id);
  const [{ data: rewards }, { data: partnerRows }, { data: refRows }] = await Promise.all([
    db().from("referral_rewards").select("referred_account_id, months").eq("account_id", account.id),
    ids.length
      ? db().from("partners").select("account_id").in("account_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? db().from("referrals").select("account_id").in("account_id", ids)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const rewarded = new Set((rewards ?? []).map((r) => r.referred_account_id));
  const hasPartner = new Set((partnerRows ?? []).map((p) => p.account_id));
  const hasReferral = new Set((refRows ?? []).map((r) => r.account_id));

  return NextResponse.json({
    managed: false,
    code: me?.referral_code ?? null,
    link: me?.referral_code ? `${appUrl()}/signup?ref=${me.referral_code}` : null,
    monthsPerReferral: REFERRER_MONTHS,
    welcomeMonths: WELCOME_MONTHS,
    proUntil: me?.pro_until ?? null,
    proDaysLeft: daysLeft(me?.pro_until),
    monthsEarned: (rewards ?? []).reduce((a, r) => a + (r.months ?? 0), 0),
    invited: (invited ?? []).map((a) => ({
      // First name only — this is a scoreboard, not a contact list.
      name: a.display_name?.split(" ")[0] ?? a.email.split("@")[0],
      joined: a.created_at,
      rewarded: rewarded.has(a.id),
      // What's still missing, so the referrer knows what to nudge.
      needsPartner: !hasPartner.has(a.id),
      needsLead: !hasReferral.has(a.id),
    })),
  });
}
