import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { appUrl } from "@/lib/helpers";
import { partnerCapacity, countPartners } from "@/lib/account";

export const dynamic = "force-dynamic";

// Partner sharing.
//
// What travels is the SETUP — company, contacts, requirements, mortgagee
// clause — never the relationship and never a single referral. The loan officer
// still has to agree to send the receiving agent business; this only means that
// when they do, the agent isn't rekeying an hour of detail that another agent
// in their office already typed once.
//
// Two things deliberately do NOT copy: SMS consent (given to one agent, not
// transferable to another) and the portal token (each agent gets their own
// board, so the lender's view stays separated by who's handling the file).

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const partnerId = String(body?.partner_id ?? "");
  if (!partnerId) return NextResponse.json({ error: "partner_id required" }, { status: 400 });

  const { data: partner } = await db()
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Reuse a live share rather than minting a new code every time the agent
  // opens the panel — a link they already sent should keep working.
  const { data: existing } = await db()
    .from("partner_shares")
    .select("code, expires_at")
    .eq("partner_id", partnerId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing?.code) {
    return NextResponse.json({ url: `${appUrl()}/share/${existing.code}` });
  }

  const { data: created, error } = await db()
    .from("partner_shares")
    .insert({ partner_id: partnerId, from_account_id: account.id })
    .select("code")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "couldn't create link" }, { status: 500 });
  }
  return NextResponse.json({ url: `${appUrl()}/share/${created.code}` });
}

// Accept a shared setup into the signed-in agent's own account.
export async function PUT(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").replace(/[^a-f0-9]/gi, "");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const { data: share } = await db()
    .from("partner_shares")
    .select("id, code, uses, max_uses, expires_at, from_account_id, partners(*)")
    .eq("code", code)
    .maybeSingle();
  if (!share) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });
  if (new Date(share.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired — ask for a new one" }, { status: 410 });
  }
  if (share.uses >= share.max_uses) {
    return NextResponse.json({ error: "This link has been used its maximum number of times" }, { status: 410 });
  }

  const src = (share as any).partners;
  if (!src) return NextResponse.json({ error: "That partner no longer exists" }, { status: 404 });
  if (src.account_id === account.id) {
    return NextResponse.json({ error: "This is already your partner" }, { status: 400 });
  }

  // Same plan enforcement a hand-typed partner gets — a shared setup is a
  // shortcut, not a way around the free tier.
  const capacity = await partnerCapacity(
    account.id,
    account.plan,
    src.partner_type ?? "lender",
    countPartners(account.id)
  );
  if (!capacity.ok) {
    return NextResponse.json({ error: capacity.error, upgrade: true }, { status: 402 });
  }

  // Same company, different agent: everything about the shop copies, nothing
  // about the working relationship does.
  const { data: partner, error } = await db()
    .from("partners")
    .insert({
      account_id: account.id,
      name: src.name,
      emails: src.emails ?? [],
      partner_type: src.partner_type ?? "lender",
      type_label: src.type_label ?? null,
      logo_path: src.logo_path ?? null,
      requirements: src.requirements ?? null,
      shared_from: share.from_account_id,
    })
    .select("id, name")
    .single();
  if (error || !partner) {
    return NextResponse.json({ error: error?.message ?? "Couldn't add that partner" }, { status: 500 });
  }

  const { data: contacts } = await db()
    .from("partner_contacts")
    .select("name, email, role, phone, notify_channel, doc_recipient")
    .eq("partner_id", src.id);

  if (contacts?.length) {
    await db()
      .from("partner_contacts")
      .insert(
        contacts.map((c: any) => ({
          partner_id: partner.id,
          name: c.name,
          email: c.email,
          role: c.role,
          phone: c.phone,
          // Consent was given to the other agent. It does not travel.
          sms_opt_in: false,
          notify_channel: c.notify_channel ?? "both",
          doc_recipient: Boolean(c.doc_recipient),
        }))
      );
  }

  await db()
    .from("partner_shares")
    .update({ uses: share.uses + 1 })
    .eq("id", share.id);

  return NextResponse.json({ ok: true, partner_id: partner.id, name: partner.name });
}
