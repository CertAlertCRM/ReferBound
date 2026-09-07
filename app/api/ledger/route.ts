import { NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { sourceLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

// The owner's number.
//
// Earned share is the producer's metric — it rewards behaviour. This is the
// one an agency owner opens a spreadsheet for: what did each source cost and
// what did it actually produce, counting the referrals its clients went on to
// send.
//
// The argument it makes is deliberately NOT "stop buying leads." A vendor
// whose clients refer is cheaper than the invoice says, and an owner who can
// see that buys more of them and works the ask harder. That is the whole
// win-win, and it only exists if the number is honest in both directions.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rows = await sourceLedger(account.id);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load" }, { status: 500 });
  }
}
