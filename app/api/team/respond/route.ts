import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, TEAM_SEAT_LIMIT } from "@/lib/account";

export const dynamic = "force-dynamic";

// An invited agent accepts (or declines) an agency's directed invite.
// Accepting links their login to the agency AND moves their existing partners
// and referrals into the agency's shared book — portals and magic links keep
// working, the data just lives under the agency now.

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (account.isTeamMember) return NextResponse.json({ error: "You're already on a team" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "");
  const accept = Boolean(body?.accept);
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const { data: invite } = await db()
    .from("team_invites")
    .select("code, account_id, invited_email")
    .eq("code", code)
    .eq("invited_email", account.email.toLowerCase())
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "invite not found or not for this account" }, { status: 404 });

  if (!accept) {
    await db().from("team_invites").delete().eq("code", invite.code);
    return NextResponse.json({ ok: true, declined: true });
  }

  // Owner must still be a valid agency with a free seat.
  const { data: owner } = await db()
    .from("accounts")
    .select("id, email, plan, team_owner_id")
    .eq("id", invite.account_id)
    .maybeSingle();
  if (!owner || owner.team_owner_id || owner.plan !== "agency") {
    return NextResponse.json({ error: "That agency isn't accepting members right now" }, { status: 400 });
  }
  const { count: members } = await db()
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("team_owner_id", owner.id);
  if ((members ?? 0) + 1 >= TEAM_SEAT_LIMIT) {
    return NextResponse.json({ error: "That agency's seats are full" }, { status: 400 });
  }

  // Link the login…
  const { error: linkErr } = await db()
    .from("accounts")
    .update({ team_owner_id: owner.id })
    .eq("id", account.selfId)
    .is("team_owner_id", null);
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  // …and move their book into the agency pool. Magic links and portals keep
  // working — only the owning account changes.
  await db().from("partners").update({ account_id: owner.id }).eq("account_id", account.selfId);
  await db().from("referrals").update({ account_id: owner.id }).eq("account_id", account.selfId);

  await db().from("team_invites").delete().eq("code", invite.code);

  // Their own Stripe subscription (if any) is now redundant — the UI reminds
  // them to cancel it; we never touch their payment relationship silently.
  return NextResponse.json({ ok: true, joined: owner.email, hadPaidPlan: account.plan !== "free" });
}
