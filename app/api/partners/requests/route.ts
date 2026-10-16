import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, partnerCapacity, countPartners } from "@/lib/account";
import { normalizeLocale } from "@/lib/i18n";

// The agent's side of the share link: who is waiting, and letting them in.
//
// Approval is where every check that the public endpoint deliberately skipped
// finally happens — the plan seat, the portal token, the contact record. That
// ordering is the whole point of the feature: proof that a real person wants in
// arrives before the agent is asked to spend anything on them.

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db()
    .from("partner_requests")
    .select("id, contact_name, company, email, phone, partner_type, note, locale, created_at")
    .eq("account_id", account.id)
    .is("approved_at", null)
    .is("declined_at", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = String(body?.action ?? "");
  if (!id || !["approve", "decline"].includes(action)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data: reqRow } = await db()
    .from("partner_requests")
    .select("*")
    .eq("id", id)
    .eq("account_id", account.id) // scoped, so a stray id from elsewhere does nothing
    .is("approved_at", null)
    .is("declined_at", null)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "decline") {
    // Kept rather than deleted, so the same person can't walk straight back
    // through the link into the queue the agent just cleared.
    await db()
      .from("partner_requests")
      .update({ declined_at: new Date().toISOString() })
      .eq("id", reqRow.id);
    return NextResponse.json({ ok: true, declined: true });
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  // The seat check lands here and nowhere earlier. An agent on the free tier
  // who has already used their lender seat gets the upgrade prompt at the
  // moment a real lender is asking to be let in, which is the only moment it
  // is a fair question.
  const capacity = await partnerCapacity(
    account.id,
    account.plan,
    reqRow.partner_type,
    countPartners(account.id)
  );
  if (!capacity.ok && !account.legacy) {
    return NextResponse.json({ error: capacity.error, upgrade: true }, { status: 402 });
  }

  const { data: partner, error: pErr } = await db()
    .from("partners")
    .insert({
      account_id: account.id,
      // The company is the partner; the person becomes a contact on it. Falls
      // back to their own name for the many partners who are one person.
      name: reqRow.company || reqRow.contact_name,
      emails: [reqRow.email],
      partner_type: reqRow.partner_type,
      source_kind: "partner",
      locale: normalizeLocale(reqRow.locale),
      // Whoever let them in owns the relationship. First real use of the
      // column migration 54 added.
      owner_producer_id: account.selfId,
    })
    .select("id, name, token")
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // The person behind the company, so referral-specific mail reaches them
  // rather than blasting a team that may be one person.
  await db().from("partner_contacts").insert({
    partner_id: partner.id,
    name: reqRow.contact_name,
    email: reqRow.email,
    role: reqRow.partner_type,
  });

  await db()
    .from("partner_requests")
    .update({ approved_at: new Date().toISOString(), partner_id: partner.id })
    .eq("id", reqRow.id);

  // Nothing is emailed from here. The agent gets the partner and the invite
  // button they already know, and sends the welcome in their own words when
  // they're ready — same rule as every other outbound message in the product.
  return NextResponse.json({
    ok: true,
    partner: { id: partner.id, name: partner.name },
  });
}
