import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import {
  cleanDealLender,
  matchExistingPartner,
  recordLenderFromRealtorDeal,
  draftLenderIntro,
  draftRealtorAsk,
} from "@/lib/realtor";
import { SAFE_STATUSES } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// The other side of a realtor's deal.
//
// Save who's handling the loan, then turn that into the introduction the agent
// would otherwise never get — either straight to the loan officer, or by asking
// the realtor to make it. Nothing sends from here; both actions return DRAFT
// TEXT the agent reads, edits, and sends themselves. An introduction that goes
// out without the agent seeing it isn't an introduction, it's a cold email with
// their name forged on it.

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const lender = cleanDealLender({ ...(body?.lender ?? {}), source: body?.lender?.source ?? "agent" });

  const { data: referral } = await db()
    .from("referrals")
    .select("id, partner_id, partners(partner_type)")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db().from("referrals").update({ deal_lender: lender }).eq("id", referral.id);

  // Only a realtor's deal feeds the prospect list. On a lender's own deal the
  // loan officer is already the partner — suggesting them would be absurd.
  let alreadyPartner: { id: string; name: string } | null = null;
  if (lender) {
    alreadyPartner = await matchExistingPartner(account.id, lender);
    if (!alreadyPartner && (referral as any).partners?.partner_type === "realtor") {
      await recordLenderFromRealtorDeal({
        accountId: account.id,
        lender,
        viaPartnerId: referral.partner_id,
      });
    }
  }

  return NextResponse.json({ ok: true, lender, alreadyPartner });
}

// Draft one of the two asks. Returns text only.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind = String(body?.kind ?? "");
  if (!["lender_intro", "realtor_ask"].includes(kind)) {
    return NextResponse.json({ error: "unknown draft" }, { status: 400 });
  }

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, property_address, status, deal_lender, partners(id, name, partner_type)")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lender = (referral as any).deal_lender ?? null;
  if (!lender?.name && !lender?.company) {
    return NextResponse.json({ error: "Add who's handling the loan first" }, { status: 400 });
  }

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name")
    .eq("account_id", account.id)
    .maybeSingle();
  const agentName = prof?.display_name || "your insurance agent";
  const agencyName = prof?.agency_name || "";
  const realtorName = (referral as any).partners?.name ?? "your realtor";

  if (kind === "realtor_ask") {
    await db()
      .from("referrals")
      .update({ realtor_ask_at: new Date().toISOString() })
      .eq("id", referral.id);
    await logActivity(referral.id, "note", `Drafted an introduction request to ${realtorName}`, "agent");
    return NextResponse.json({
      text: draftRealtorAsk({
        realtorFirst: String(realtorName).split(" ")[0],
        clientName: referral.client_name,
        lenderLabel: lender.name || lender.company,
        agentName,
      }),
    });
  }

  // The loan officer's introduction needs somewhere to land. Reuse the realtor's
  // own portal only if the lender is already a partner; otherwise the agent
  // sets the portal up when the lender says yes, and the link is the demo.
  const { data: acct } = await db().from("accounts").select("demo_token").eq("id", account.id).maybeSingle();
  const existing = await matchExistingPartner(account.id, lender);
  let portalUrl = `${appUrl()}/demo/${acct?.demo_token ?? ""}`;
  if (existing) {
    const { data: p } = await db().from("partners").select("token").eq("id", existing.id).maybeSingle();
    if (p?.token) portalUrl = `${appUrl()}/p/${p.token}`;
  }

  await db()
    .from("referrals")
    .update({ lender_intro_at: new Date().toISOString() })
    .eq("id", referral.id);
  await logActivity(
    referral.id,
    "note",
    `Drafted an introduction to ${lender.name ?? lender.company}`,
    "agent"
  );

  return NextResponse.json({
    text: draftLenderIntro({
      agentName,
      agencyName,
      lenderFirst: String(lender.name ?? lender.company).split(" ")[0],
      clientName: referral.client_name,
      address: referral.property_address ?? null,
      realtorName,
      portalUrl,
      bound: SAFE_STATUSES.includes(referral.status),
    }),
    needsDemoToken: !existing && !acct?.demo_token,
  });
}
