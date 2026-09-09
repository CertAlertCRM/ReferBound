import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, visibleReferral } from "@/lib/account";

// "I've seen it."
//
// Called by the deal page when it mounts. Its only job is to clear the
// assigned_at marker once the person the lead was handed to actually opens it,
// which is what turns "3 waiting for you" back into 2.
//
// Why a route of its own rather than a flag on the PATCH the deal page already
// makes: that PATCH fires when something CHANGES. Opening a lead and reading
// it is not a change, and a producer who looks at a hand-off, decides to call
// after lunch, and edits nothing would otherwise keep the badge forever.
//
// Sends nothing, touches no client-facing field, and is safe to call on every
// mount — the update is a no-op once the marker is gone.

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Same gate as everywhere else — a producer cannot mark a colleague's deal
  // as read any more than they can open it.
  const ref = await visibleReferral(account, params.id, "id, producer_id, assigned_at");
  if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only the person it was handed TO clears it. An owner reviewing what they
  // handed off should still see it marked waiting, because from their side it
  // is: nobody has picked it up yet.
  if (!ref.assigned_at || ref.producer_id !== account.selfId) {
    return NextResponse.json({ ok: true, cleared: false });
  }

  await db().from("referrals").update({ assigned_at: null }).eq("id", ref.id);
  return NextResponse.json({ ok: true, cleared: true });
}
