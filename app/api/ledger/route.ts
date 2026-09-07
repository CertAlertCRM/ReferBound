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
  // Pro gate. The work stays free — the queue, the asks, earned share, every
  // deal. This is the analysis on top of it, and it is the number an agency
  // OWNER opens a spreadsheet for, which makes it the right thing to charge
  // for: it is aimed at the person who holds the budget, and locking it stops
  // nobody from running their book.
  const pro = account.plan !== "free" || account.legacy;

  try {
    const rows = await sourceLedger(account.id);
    if (!pro) {
      // Enough to know what is behind the lock, not enough to be the lock.
      // The teaser is a true number about their own book: how many policies
      // came from clients that another source produced.
      const downstream = rows.reduce((a, r) => a + r.downstream, 0);
      return NextResponse.json({
        locked: true,
        downstream,
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          policies: r.policies,
          spendMonthlyCents: null,
          monthsActive: r.monthsActive,
          spendToDateCents: null,
          downstream: 0,
          costPerPolicyCents: null,
          costDirectOnlyCents: null,
        })),
      });
    }
    return NextResponse.json({ locked: false, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load" }, { status: 500 });
  }
}
