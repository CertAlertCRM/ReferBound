import { db } from "@/lib/db";
import { loose, looksLikeServicer } from "@/lib/partner-gaps";

// The realtor triangle.
//
// On every purchase there are three professionals around one buyer: the
// realtor, the loan officer, and the insurance agent. The realtor is the only
// one who reliably knows the other two. That makes a realtor referral worth
// more than the single client it carries.
//
// Two things about how realtors actually refer shape everything here.
//
// They call. They don't send a loan application, an insurance request, or any
// document at all — they ring up and say a name. So nothing in this flow may
// depend on a document arriving, and the loan officer's details can only come
// from one place: asking the realtor.
//
// And the reason to ask is not "I'd like your business." It's that knowing the
// loan officer lets the agent send the mortgage team their documents BEFORE
// anyone requests them. A processor who receives a correct evidence of
// insurance unprompted, days ahead of the file needing it, remembers the agent
// who did that. The introduction is the by-product; being early is the point.
//
// Hence the sequence: ask the realtor on day one because it helps the closing,
// deliver unprompted when the policy binds, and only then — once the loan
// officer has actually watched the work — talk about working together.

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
    // Partner gaps are never allowed to break the thing that triggered them.
  }
}

// ── Step one: get the loan officer's details from the realtor ───────────────
//
// Short enough to send as a text, because that's how realtors answer. The ask
// is framed entirely around their closing — an agent asking "who's the lender
// so I can get them what they need" is helping; an agent asking "who's the
// lender so I can pitch them" is asking for a favour. The first one gets
// answered in four minutes.

export function draftRealtorContactAsk(opts: {
  realtorFirst: string;
  clientName: string;
  agentName: string;
}): string {
  return (
    `Hi ${opts.realtorFirst} — got ${opts.clientName} and I'm on the quote.\n\n` +
    `Who's handling their loan? If you can send me the loan officer's email (or their processor's), ` +
    `I'll get the evidence of insurance straight to them as soon as it's issued instead of waiting ` +
    `for someone to chase it. Saves a step at closing.\n\n` +
    `Thanks — ${opts.agentName}`
  );
}

// ── Step two: deliver before anyone asks ────────────────────────────────────
//
// The whole reason for step one. Links are signed per-document and expiring —
// the loan officer is not a partner and must never receive a portal token.

export function draftLenderDocs(opts: {
  lenderFirst: string;
  agentName: string;
  agencyName: string;
  clientName: string;
  address: string | null;
  realtorName: string;
  closingDate: string | null;
  docs: { label: string; url: string }[];
}): string {
  const where = opts.address ? ` at ${opts.address}` : "";
  const closing = opts.closingDate ? ` closing ${opts.closingDate}` : "";
  const list = opts.docs.map((d) => `${d.label}: ${d.url}`).join("\n");

  return (
    `Hi ${opts.lenderFirst},\n\n` +
    `I'm the insurance agent on ${opts.clientName}${where}${closing} — ${opts.realtorName} connected us.\n\n` +
    `The policy is bound and here's everything for your file, ahead of the request:\n\n${list}\n\n` +
    `If your processor needs the mortgagee clause worded differently, a different effective date, or ` +
    `anything else adjusted to match the file, reply here and I'll reissue it the same day.\n\n` +
    `${opts.agentName}\n${opts.agencyName}`
  );
}

// ── Step three: only once they've seen the work ─────────────────────────────

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
    ? `I handled the insurance for ${opts.clientName}${where} — you should already have the evidence of insurance; I sent it over as soon as it was issued rather than waiting for the request.`
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
    `Quick favour — I've got ${opts.clientName} handled on the insurance side and their documents are already with the lender. ` +
    `Would you mind introducing me to ${opts.lenderLabel}? ` +
    `Being connected to the loan officer directly means I can keep doing what I did on this one — getting them the evidence of insurance before anybody has to ask — which takes a step off your plate on the next closing too.\n\n` +
    `A one-line email is all it takes. Thanks either way.\n\n` +
    `${opts.agentName}`
  );
}
