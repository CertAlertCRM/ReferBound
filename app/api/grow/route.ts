import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, partnerCapacity, countPartners } from "@/lib/account";
import { SAFE_STATUSES } from "@/lib/config";
import { earnedShare, readyToPromote, type SourceKind } from "@/lib/sources";
import {
  cleanLines,
  isMonoline,
  linesRecorded,
  linesSummary,
  multilineRate,
  renewalDue,
  renewalLabel,
  roundOutSuggestions,
} from "@/lib/lines";

export const dynamic = "force-dynamic";

// The growth surface.
//
// Everything else in this product tracks work that already exists. This is the
// one endpoint that asks the other question: what did the work you already did
// go on to produce, and who haven't you asked yet.
//
// Three numbers, in the order a producer actually cares about them:
//
//   1. Earned share — of the policies you wrote, how many came from somebody
//      who sent them to you rather than from a list you bought. Their own
//      data, no benchmark. It only moves when they do the work.
//   2. The unasked queue — clients you bound and never asked. This is the
//      whole product in one list. An agent who works it has a reason to open
//      ReferBound on a Tuesday; an agent who doesn't has a CRM.
//   3. Promotions — a client who has now sent two. They are not a client any
//      more and nobody noticed.
//
// Deliberately NOT here: a close rate, a benchmark against other agencies, or
// anything that requires logging every lead bought. See the thesis.

// A bound policy is not an ask. The client needs their documents, the file
// needs to have gone smoothly, and the welcome email needs to have landed.
// Asking the hour a policy binds is how you teach somebody to ignore the
// prompt. Three days is the floor.
const WARM_DAYS = 3;

// A review ask and a referral ask are the same favor asked twice. Space them.
const REVIEW_GAP_DAYS = 14;

const DAY = 86_400_000;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / DAY);
}

// PostgREST silently caps a response at 1,000 rows. An agency with three
// producers and two years of history blows through that, and the failure mode
// is a quietly wrong number rather than an error — so page explicitly.
async function fetchAllRows(table: string, cols: string, accountId: string): Promise<any[]> {
  const PAGE = 1000;
  const MAX_PAGES = 25;
  const out: any[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await (db() as any)
      .from(table)
      .select(cols)
      .eq("account_id", accountId)
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export type QueueItem = {
  id: string;
  clientName: string;
  partnerName: string | null;
  sourceKind: SourceKind;
  boundDays: number | null; // days since the policy bound, null if unknown
  askReferral: boolean;
  askReview: boolean;
  // The round-out. A producer doesn't make an "ask call" and a separate
  // "cross-sell call" — they call the client once. So this rides on the same
  // row rather than in a second queue, and the row says what to cover.
  roundOut: boolean;
  linesLabel: string;
  missing: string[];
  renewLabel: string | null;
  renewSoon: boolean;
  // Somebody they named and nobody has called. Highest intent in the product
  // and the shortest fuse, so it outranks everything else in the list.
  promise: string | null;
};

export async function GET(_req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let referrals: any[];
  let partners: any[];
  try {
    [referrals, partners] = await Promise.all([
      fetchAllRows(
        "referrals",
        "id, client_name, partner_id, status, asked_at, review_asked_at, parent_referral_id, lines, xsell_asked_at, xsell_target_date, promised_note, updated_at, created_at",
        account.id
      ),
      fetchAllRows("partners", "id, name, source_kind", account.id),
    ]);
  } catch (e: any) {
    // A failed read is not a cold start. If this ever throws — a missing
    // column, a bad deploy — the card must go quiet, never tell an agent with
    // a full book that they have written nothing.
    console.error("grow: read failed", e?.message);
    return NextResponse.json({ unavailable: true });
  }

  const partnerById = new Map<string, any>(partners.map((p) => [p.id, p] as [string, any]));
  const kindOf = (partnerId: string | null): SourceKind =>
    ((partnerId && partnerById.get(partnerId)?.source_kind) || "partner") as SourceKind;

  // ── 1. Earned share ───────────────────────────────────────────────────────
  const earned = earnedShare(
    referrals.map((r) => ({ status: r.status, source_kind: kindOf(r.partner_id) }))
  );

  const won = referrals.filter((r) => SAFE_STATUSES.includes(r.status));

  // ── 2. The unasked queue ──────────────────────────────────────────────────
  //
  // When a policy actually bound is worth getting right — updated_at moves
  // every time somebody edits a note. status_events has the real answer, so
  // read it for the won set and fall back to updated_at only where it's
  // missing (rows written before the event log, or imported history).
  const wonIds = won.map((r) => r.id);
  const boundAt = new Map<string, string>();
  for (let i = 0; i < wonIds.length; i += 200) {
    const slice = wonIds.slice(i, i + 200);
    const { data } = await db()
      .from("status_events")
      .select("referral_id, created_at")
      .in("referral_id", slice)
      .eq("status", "bound")
      .order("created_at", { ascending: true });
    for (const ev of ((data ?? []) as any[])) {
      if (!boundAt.has(ev.referral_id)) boundAt.set(ev.referral_id, ev.created_at);
    }
  }

  // Which clients have already produced a referral. An open promise closes the
  // moment the person they named actually turns up — asking a producer to tick
  // something off that the data already knows is how a queue loses trust.
  const producedFrom = new Set<string>(
    referrals.filter((r) => r.parent_referral_id).map((r) => r.parent_referral_id as string)
  );

  const queue: QueueItem[] = [];
  let warming = 0;

  for (const r of won) {
    const when = boundAt.get(r.id) ?? r.updated_at ?? r.created_at;
    const days = daysSince(when);

    // Monoline, never pitched. Only counts once lines were actually recorded —
    // an empty lines array means nobody ticked the boxes, not that the
    // household is monoline, and guessing there would be a lie.
    const roundOut = !r.xsell_asked_at && linesRecorded(r.lines) && isMonoline(r.lines);

    // Never ask a paid lead's "source" for a referral — there is nobody there.
    // But the CLIENT from a paid lead is exactly who this is for: that's the
    // conversion the whole thesis turns on.
    const promise =
      typeof r.promised_note === "string" && r.promised_note.trim() && !producedFrom.has(r.id)
        ? r.promised_note.trim()
        : null;

    const askedRef = !r.asked_at;
    const askedRev =
      !r.review_asked_at && (r.asked_at ? (daysSince(r.asked_at) ?? 0) >= REVIEW_GAP_DAYS : false);

    if (!askedRef && !askedRev && !roundOut && !promise) continue;

    // A round-out whose renewal window is open beats the warming rule: if
    // their other policy comes up in three weeks, waiting is how you miss it.
    // A named person waiting on a call is never "too fresh" to act on.
    const renewSoon = roundOut && renewalDue(r.xsell_target_date);
    if (days !== null && days < WARM_DAYS && !renewSoon && !promise) {
      warming++;
      continue;
    }

    queue.push({
      id: r.id,
      clientName: r.client_name,
      partnerName: r.partner_id ? partnerById.get(r.partner_id)?.name ?? null : null,
      sourceKind: kindOf(r.partner_id),
      boundDays: days,
      askReferral: askedRef,
      askReview: askedRev,
      roundOut,
      linesLabel: linesSummary(r.lines),
      missing: roundOut ? roundOutSuggestions(r.lines) : [],
      renewLabel: roundOut ? renewalLabel(r.xsell_target_date) : null,
      renewSoon,
      promise,
    });
  }

  // Oldest first. A client you bound in March and never asked is the one
  // getting colder, and it is the one the agent has genuinely forgotten.
  queue.sort((a, b) => {
    // Named person first, then a renewal window closing, then oldest.
    const ap = a.promise ? 1 : 0;
    const bp = b.promise ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (a.renewSoon !== b.renewSoon) return a.renewSoon ? -1 : 1;
    return (b.boundDays ?? 0) - (a.boundDays ?? 0);
  });

  // ── 3. Promotions ─────────────────────────────────────────────────────────
  const countBySource = new Map<string, number>();
  for (const r of referrals) {
    if (!r.partner_id) continue;
    countBySource.set(r.partner_id, (countBySource.get(r.partner_id) ?? 0) + 1);
  }
  const promote = partners
    .filter((p) => readyToPromote(p.source_kind, countBySource.get(p.id) ?? 0))
    .map((p) => ({ id: p.id, name: p.name, count: countBySource.get(p.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  // Asks that have actually been made — the counterweight to the queue, so the
  // card has something to show an agent who has worked it down to zero.
  const askedCount = referrals.filter((r) => r.asked_at).length;

  return NextResponse.json({
    earned,
    queue: queue.slice(0, 25),
    queueTotal: queue.length,
    warming,
    promote,
    askedCount,
    // The producer's second number. Households carrying more than one line,
    // out of the households where lines were recorded at all.
    multiline: multilineRate(won.map((r) => ({ lines: cleanLines(r.lines) }))),
    // Nothing bound yet: the card should say so rather than showing three
    // zeroes and implying the agent is failing at something.
    // Only ever true because the data arrived and was empty.
    coldStart: won.length === 0,
  });
}

// Promote a referring client to a standing partner.
//
// This changes what they ARE, not what they receive: no portal invite goes out
// here. Anything a partner sees is a deliberate click on the partners page.
export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const partnerId = String(body?.partnerId || "");
  if (!partnerId) return NextResponse.json({ error: "Missing partner" }, { status: 400 });

  const { data: partner } = await db()
    .from("partners")
    .select("id, name, source_kind, partner_type")
    .eq("id", partnerId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The free wall lives HERE, not at logging. A client-kind source costs
  // nothing to hold; a standing partner gets a portal, which is the thing the
  // plan actually sells. Checked at the moment the portal is granted.
  const capacity = await partnerCapacity(
    account.id,
    account.plan,
    partner.partner_type ?? "other",
    countPartners(account.id)
  );
  if (!capacity.ok) {
    return NextResponse.json({ error: capacity.error, upgrade: true }, { status: 402 });
  }

  const { error } = await db()
    .from("partners")
    .update({ source_kind: "partner" })
    .eq("id", partnerId)
    .eq("account_id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, name: partner.name });
}
