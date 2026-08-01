import { db } from "@/lib/db";
import { loose, looksLikeServicer } from "@/lib/radar";

// The realtor triangle.
//
// On every purchase there are three professionals around one buyer: the
// realtor, the loan officer, and the insurance agent. The realtor is the only
// one who reliably knows the other two. That makes a realtor referral worth
// more than the single client it carries — it's an introduction to a lender,
// on a file where the agent is about to prove the exact thing that lender
// cares about.
//
// The timing is the whole trick. Asking a loan officer for their business
// cold is a coin flip. Asking one week after they watched your evidence of
// insurance land correct and early on a shared closing is a different
// conversation entirely.

export type DealLender = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null; // realtor | agent | document
};

export function cleanDealLender(input: any): DealLender | null {
  const name = String(input?.name ?? "").trim().slice(0, 120) || null;
  const company = String(input?.company ?? "").trim().slice(0, 160) || null;
  const email = String(input?.email ?? "").trim().toLowerCase().slice(0, 200) || null;
  const phone = String(input?.phone ?? "").trim().slice(0, 40) || null;
  if (!name && !company) return null;
  // The servicer guard applies here too: a realtor typing "Mr. Cooper" means
  // the servicer, not the person who originated the loan.
  if (looksLikeServicer(company) || looksLikeServicer(name)) return null;
  return {
    name,
    company,
    email,
    phone,
    source: String(input?.source ?? "").trim() || "agent",
  };
}

// Is this lender already somebody the agent works with? Returns the partner if
// so, which is how the UI knows to say "already yours" instead of offering an
// introduction to a partner they've had for a year.
export async function matchExistingPartner(
  accountId: string,
  lender: DealLender
): Promise<{ id: string; name: string } | null> {
  if (!lender.company && !lender.email) return null;
  const { data: partners } = await db()
    .from("partners")
    .select("id, name, partner_contacts(email)")
    .eq("account_id", accountId);
  for (const p of (partners ?? []) as any[]) {
    if (lender.company && loose(p.name) === loose(lender.company)) return { id: p.id, name: p.name };
    if (lender.email) {
      const hit = (p.partner_contacts ?? []).some(
        (c: any) => String(c.email ?? "").toLowerCase() === lender.email
      );
      if (hit) return { id: p.id, name: p.name };
    }
  }
  return null;
}

// Record the loan officer on a realtor's deal as a prospect, remembering which
// realtor surfaced them and how many files they now share. The count is the
// story — one shared closing is a coincidence, four is a relationship the
// agent already has and hasn't noticed.
export async function recordLenderFromRealtorDeal(opts: {
  accountId: string;
  lender: DealLender;
  viaPartnerId: string | null;
}): Promise<void> {
  try {
    const { accountId, lender, viaPartnerId } = opts;
    if (!lender.name && !lender.company) return;
    if (await matchExistingPartner(accountId, lender)) return;

    const { data: existing } = await db()
      .from("partner_prospects")
      .select("id, deal_count, name, company, email")
      .eq("account_id", accountId)
      .is("converted_partner_id", null)
      .limit(200);

    const match = (existing ?? []).find(
      (p: any) =>
        (lender.email && String(p.email ?? "").toLowerCase() === lender.email) ||
        (lender.company && loose(p.company) === loose(lender.company) && loose(p.name) === loose(lender.name)) ||
        (lender.name && lender.company && loose(p.name) === loose(lender.name))
    );

    if (match) {
      await db()
        .from("partner_prospects")
        .update({
          deal_count: (match.deal_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
          // Fill blanks we've since learned without overwriting what's there.
          email: match.email ?? lender.email,
          via_partner_id: viaPartnerId,
        })
        .eq("id", match.id);
      return;
    }

    await db().from("partner_prospects").insert({
      account_id: accountId,
      name: lender.name,
      company: lender.company,
      email: lender.email,
      phone: lender.phone,
      partner_type: "lender",
      source: "realtor_deal",
      status: "idea",
      deal_count: 1,
      last_seen_at: new Date().toISOString(),
      via_partner_id: viaPartnerId,
    });
  } catch {
    // Radar is never allowed to break the thing that triggered it.
  }
}

// ── The two asks ────────────────────────────────────────────────────────────

export function draftLenderIntro(opts: {
  agentName: string;
  agencyName: string;
  lenderFirst: string;
  clientName: string;
  address: string | null;
  realtorName: string;
  portalUrl: string;
  bound: boolean;
}): string {
  const where = opts.address ? ` on ${opts.address}` : "";
  const proof = opts.bound
    ? `I handled the insurance for ${opts.clientName}${where} — evidence of insurance went out ahead of closing with the mortgagee clause and loan number already matched to your file.`
    : `I'm handling the insurance for ${opts.clientName}${where}, so we're on the same file this month.`;

  return (
    `Hi ${opts.lenderFirst},\n\n` +
    `${proof} ${opts.realtorName} connected us.\n\n` +
    `I keep a live board for the loan officers I work with — every client they send me, real-time status, and the documents downloadable the moment they're issued, so nobody has to email me asking where things stand. It's free and there's nothing to log into.\n\n` +
    `If that would make your files easier, here's yours:\n${opts.portalUrl}\n\n` +
    `Either way, glad to be working with you.\n\n` +
    `${opts.agentName}\n${opts.agencyName}`
  );
}

export function draftRealtorAsk(opts: {
  realtorFirst: string;
  clientName: string;
  lenderLabel: string;
  agentName: string;
}): string {
  return (
    `Hi ${opts.realtorFirst},\n\n` +
    `Quick favour — I've got ${opts.clientName} handled on the insurance side. ` +
    `Would you mind introducing me to ${opts.lenderLabel}? ` +
    `If I'm connected to the loan officer directly I can get them the evidence of insurance the moment it's issued instead of routing it through you, which takes one more thing off your plate on this closing and the next one.\n\n` +
    `A one-line email is all it takes. Thanks either way.\n\n` +
    `${opts.agentName}`
  );
}
