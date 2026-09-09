import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, teamMembers, TEAM_SEAT_LIMIT } from "@/lib/account";
import { logActivity } from "@/lib/activity";

// The owner's view of who is on the account and what each of them has done.
//
// Owner-only, and not by a flag — by construction. The roster is "accounts
// whose team_owner_id is me", so a producer asking this question gets an empty
// list back, because nobody has a producer as their owner. There is no branch
// to forget.
//
// Counts are per producer rather than a single grouped query on purpose:
// PostgREST has no GROUP BY, the seat limit is seven, and eight head-counts
// that are correct beat one clever query that isn't.

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  email: string;
  logged: number;
  bound: number;
  asked: number;
};

async function countFor(
  accountId: string,
  build: (q: any) => any
): Promise<number> {
  const q = db()
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);
  const { count } = await build(q);
  return count ?? 0;
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A producer gets an honest, empty answer rather than a 403. The client uses
  // this to decide whether to render tabs at all, and a failed request there
  // would look like a broken page instead of a page that simply has no team.
  if (account.isTeamMember) {
    return NextResponse.json({ isOwner: false, members: [], mine: null, unassigned: 0 });
  }

  const roster = await teamMembers(account.id);

  const members: Row[] = [];
  for (const m of roster) {
    const [logged, bound, asked] = await Promise.all([
      countFor(account.id, (q) => q.eq("producer_id", m.id)),
      countFor(account.id, (q) => q.eq("producer_id", m.id).eq("status", "bound")),
      countFor(account.id, (q) => q.eq("producer_id", m.id).not("asked_at", "is", null)),
    ]);
    members.push({
      id: m.id,
      name: m.display_name || m.email,
      email: m.email,
      logged,
      bound,
      asked,
    });
  }

  // The owner's own line, shown alongside the team rather than above it —
  // an owner who logs nothing while asking producers to log everything is a
  // thing the number should be allowed to say out loud.
  const [mineLogged, mineBound, mineAsked, unassigned] = await Promise.all([
    countFor(account.id, (q) => q.or(`producer_id.eq.${account.selfId},producer_id.is.null`)),
    countFor(account.id, (q) =>
      q.or(`producer_id.eq.${account.selfId},producer_id.is.null`).eq("status", "bound")
    ),
    countFor(account.id, (q) =>
      q.or(`producer_id.eq.${account.selfId},producer_id.is.null`).not("asked_at", "is", null)
    ),
    countFor(account.id, (q) => q.is("producer_id", null)),
  ]);

  return NextResponse.json({
    isOwner: true,
    seats: { used: roster.length + 1, limit: TEAM_SEAT_LIMIT },
    mine: {
      id: account.selfId,
      name: account.display_name || account.email,
      email: account.email,
      logged: mineLogged,
      bound: mineBound,
      asked: mineAsked,
    },
    members,
    // Leads logged before the product recorded who logged them. Sitting in the
    // owner's book until somebody says otherwise.
    unassigned,
  });
}

// Move a lead to the producer who actually worked it.
//
// This exists because attribution is newer than the book. An agency with six
// months of history has rows nobody can be inferred from, and the only correct
// source for that is a human who was there. Owner-only, one direction, and it
// notifies nobody — reassigning a lead is bookkeeping, not an event in the
// client's life.
export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (account.isTeamMember) {
    return NextResponse.json({ error: "Only the account owner can reassign leads." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.referral_ids)
    ? body.referral_ids.filter((v: unknown) => typeof v === "string").slice(0, 500)
    : typeof body?.referral_id === "string"
      ? [body.referral_id]
      : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "referral_ids is required" }, { status: 400 });
  }

  // null is a legitimate target: "actually, nobody — put it back". Anything
  // else has to be a person on this account, checked against the roster rather
  // than trusted from the request.
  const target: string | null = typeof body?.producer_id === "string" ? body.producer_id : null;
  if (target && target !== account.selfId) {
    const roster = await teamMembers(account.id);
    if (!roster.some((m) => m.id === target)) {
      return NextResponse.json({ error: "That producer is not on this account." }, { status: 400 });
    }
  }

  // Handing a lead to someone marks it waiting for them. Putting it back —
  // target null, or the owner taking it themselves — clears that marker, so an
  // unassigned row never sits in a queue nobody owns.
  const handedOff = target !== null && target !== account.selfId;
  const { data, error } = await db()
    .from("referrals")
    .update({
      producer_id: target,
      assigned_at: handedOff ? new Date().toISOString() : null,
      assigned_by: handedOff ? account.selfId : null,
    })
    .in("id", ids)
    .eq("account_id", account.id) // scoped, so a stray id from elsewhere does nothing
    .select("id, client_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const moved = data ?? [];
  for (const r of moved) {
    await logActivity(r.id, "producer_assigned", "Lead assigned to a producer", "agent");
  }
  return NextResponse.json({ updated: moved.length });
}
