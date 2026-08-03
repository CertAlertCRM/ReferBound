import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import {
  cleanDealLender,
  matchExistingPartner,
  recordLenderFromRealtorDeal,
  draftLenderIntro,
  draftRealtorAsk,
  draftRealtorContactAsk,
  draftLenderDocs,
} from "@/lib/realtor";
import { DOC_KINDS, SAFE_STATUSES } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { appUrl, fmtDate } from "@/lib/helpers";
import { signDocUrl } from "@/lib/doclink";

export const dynamic = "force-dynamic";

// The other side of a realtor's deal.
//
// Realtors refer by phone. No loan application arrives, no insurance request,
// nothing that names the loan officer — so the only way to learn who's on the
// other side is to ask, and the only reason worth asking is that it lets the
// agent get documents to the mortgage team before anyone chases them.
//
// Four drafts, in the order they're useful: ask the realtor who the lender is,
// send that lender the documents unprompted, then — once they've seen it —
// either introduce yourself or ask the realtor to. Nothing sends from here.
// Every action returns DRAFT TEXT the agent reads, edits, and sends themselves.
// An introduction that goes out without the agent seeing it isn't an
// introduction, it's a cold email with their name forged on it.

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
  if (!["contact_ask", "lender_docs", "lender_intro", "realtor_ask"].includes(kind)) {
    return NextResponse.json({ error: "unknown draft" }, { status: 400 });
  }

  const { data: referral } = await db()
    .from("referrals")
    .select(
      "id, client_name, property_address, closing_date, status, deal_lender, partners(id, name, partner_type)"
    )
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lender = (referral as any).deal_lender ?? null;
  // Asking the realtor who the lender is obviously can't require knowing who
  // the lender is. Every other draft can.
  if (kind !== "contact_ask" && !lender?.name && !lender?.company) {
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

  // ── Day one: who's handling the loan? ────────────────────────────────────
  if (kind === "contact_ask") {
    await logActivity(
      referral.id,
      "note",
      `Drafted a request to ${realtorName} for the loan officer's details`,
      "agent"
    );
    return NextResponse.json({
      text: draftRealtorContactAsk({
        realtorFirst: String(realtorName).split(" ")[0],
        clientName: referral.client_name,
        agentName,
      }),
    });
  }

  // ── Bound: send the mortgage team their documents, unprompted ────────────
  if (kind === "lender_docs") {
    const { data: docs } = await db()
      .from("documents")
      .select("id, kind, file_name")
      .eq("referral_id", referral.id)
      .in("kind", ["eoi", "rce", "dec"])
      .is("purged_at", null)
      .order("created_at", { ascending: true });

    if (!docs?.length) {
      return NextResponse.json(
        { error: "Upload the EOI first — there's nothing to send yet." },
        { status: 400 }
      );
    }

    // One signed link per document. The loan officer has no account and no
    // portal, and must never be handed a partner token.
    const links = (docs as any[]).map((d) => ({
      label: DOC_KINDS[d.kind] ?? d.file_name ?? "Document",
      url: signDocUrl(d.id),
    }));

    await db()
      .from("referrals")
      .update({ lender_docs_sent_at: new Date().toISOString() })
      .eq("id", referral.id);
    await logActivity(
      referral.id,
      "note",
      `Drafted a document hand-off to ${lender.name ?? lender.company} (${links.length} document${links.length === 1 ? "" : "s"})`,
      "agent"
    );

    return NextResponse.json({
      text: draftLenderDocs({
        lenderFirst: String(lender.name ?? lender.company).split(" ")[0],
        agentName,
        agencyName,
        clientName: referral.client_name,
        address: referral.property_address ?? null,
        realtorName,
        closingDate: referral.closing_date ? fmtDate(referral.closing_date) : null,
        docs: links,
      }),
    });
  }

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
