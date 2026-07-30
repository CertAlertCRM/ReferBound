import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, TEAM_SEAT_LIMIT } from "@/lib/account";
import { sendEmail, plainBodyEmail } from "@/lib/email";
import { normalizeEmail, EMAIL_RE } from "@/lib/format";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// Agency owner invites an EXISTING agent account by email. The agent must
// accept from their profile page — joining moves their partners and referrals
// into the agency's shared book, so it's never done to them silently.

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (account.isTeamMember) return NextResponse.json({ error: "Only the agency owner can invite" }, { status: 403 });
  if (account.plan !== "agency") {
    return NextResponse.json(
      { error: "Team seats are part of the Agency plan — upgrade on the billing page first." },
      { status: 402 }
    );
  }

  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: "valid email required" }, { status: 400 });
  if (email === account.email.toLowerCase()) {
    return NextResponse.json({ error: "that's your own email" }, { status: 400 });
  }

  const { data: target } = await db()
    .from("accounts")
    .select("id, email, team_owner_id")
    .eq("email", email)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: "No ReferBound account with that email — send them your invite link instead and they can sign up straight onto your team." },
      { status: 404 }
    );
  }
  if (target.team_owner_id) {
    return NextResponse.json({ error: "They're already on an agency team" }, { status: 400 });
  }
  const { count: theirMembers } = await db()
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("team_owner_id", target.id);
  if ((theirMembers ?? 0) > 0) {
    return NextResponse.json({ error: "They run their own agency team and can't be added to yours" }, { status: 400 });
  }

  const { count: myMembers } = await db()
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("team_owner_id", account.id);
  if ((myMembers ?? 0) + 1 >= TEAM_SEAT_LIMIT) {
    return NextResponse.json({ error: `All ${TEAM_SEAT_LIMIT} seats are in use` }, { status: 400 });
  }

  // One live invite per (owner, email) — re-sending replaces the old one.
  await db().from("team_invites").delete().eq("account_id", account.id).eq("invited_email", email);
  const { error } = await db().from("team_invites").insert({ account_id: account.id, invited_email: email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendEmail({
    kind: "team_invite",
    to: [email],
    subject: `${account.email} invited you to join their agency on ReferBound`,
    html: plainBodyEmail(
      `${account.email} invited you to join their agency team on ReferBound.\n\n` +
        `If you accept, your partners and referrals move into the agency's shared book, ` +
        `and your seat is covered by the agency's plan.\n\n` +
        `Accept or decline from your profile page: ${appUrl()}/profile`
    ),
  });

  return NextResponse.json({ ok: true });
}

// Cancel a pending directed invite (owner only).
export async function DELETE(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (account.isTeamMember) return NextResponse.json({ error: "Only the agency owner can do this" }, { status: 403 });

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const { error } = await db()
    .from("team_invites")
    .delete()
    .eq("code", code)
    .eq("account_id", account.id)
    .not("invited_email", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
