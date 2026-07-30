import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, TEAM_SEAT_LIMIT } from "@/lib/account";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// Agency team management. The OWNER (an Agency-plan account with no
// team_owner_id) invites teammates via a rotating invite link; teammates share
// the owner's whole book. Members see who runs their plan; owners see seats.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (account.isTeamMember) {
    return NextResponse.json({ role: "member", ownerEmail: account.ownerEmail });
  }

  const { data: members } = await db()
    .from("accounts")
    .select("id, email, display_name, created_at")
    .eq("team_owner_id", account.id)
    .order("created_at", { ascending: true });

  // Generic signup link only — directed email invites are a separate list.
  const { data: invite } = await db()
    .from("team_invites")
    .select("code")
    .eq("account_id", account.id)
    .is("invited_email", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Directed invites this owner has out to existing agents.
  const { data: pending } = await db()
    .from("team_invites")
    .select("code, invited_email")
    .eq("account_id", account.id)
    .not("invited_email", "is", null)
    .order("created_at", { ascending: true });

  // An invite waiting for THIS account (solo agents see a join banner).
  const { data: incoming } = await db()
    .from("team_invites")
    .select("code, accounts:account_id(email)")
    .eq("invited_email", account.email.toLowerCase())
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    role: "owner",
    plan: account.plan,
    members: members ?? [],
    seatLimit: TEAM_SEAT_LIMIT,
    seatsUsed: (members?.length ?? 0) + 1,
    inviteUrl: invite ? `${appUrl()}/signup?invite=${invite.code}` : null,
    pendingInvites: pending ?? [],
    incomingInvite: incoming
      ? { code: incoming.code, ownerEmail: (incoming as any).accounts?.email ?? "an agency owner" }
      : null,
  });
}

// Create / rotate the invite link (owner only, Agency plan only).
export async function POST() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (account.isTeamMember) return NextResponse.json({ error: "Only the agency owner can invite" }, { status: 403 });
  if (account.plan !== "agency") {
    return NextResponse.json(
      { error: "Team seats are part of the Agency plan — upgrade on the billing page first." },
      { status: 402 }
    );
  }

  // Rotate: old links stop working the moment a new one is created.
  // Directed email invites (invited_email set) are untouched by rotation.
  await db().from("team_invites").delete().eq("account_id", account.id).is("invited_email", null);
  const { data: invite, error } = await db()
    .from("team_invites")
    .insert({ account_id: account.id })
    .select("code")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inviteUrl: `${appUrl()}/signup?invite=${invite.code}` });
}

// Remove a teammate (owner only). Their login survives as an empty free
// account — they just lose access to the agency's shared book.
export async function DELETE(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (account.isTeamMember) return NextResponse.json({ error: "Only the agency owner can remove members" }, { status: 403 });

  const memberId = new URL(req.url).searchParams.get("id");
  if (!memberId) return NextResponse.json({ error: "member id required" }, { status: 400 });

  const { error } = await db()
    .from("accounts")
    .update({ team_owner_id: null })
    .eq("id", memberId)
    .eq("team_owner_id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
