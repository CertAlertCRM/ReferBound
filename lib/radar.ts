import { db } from "@/lib/db";

// Partner gaps.
//
// This used to mine uploaded documents for loan officers the agent had never
// set up as partners, on the theory that a book of documents hides a book of
// relationships. That theory was wrong. An agent does not receive loan
// documents from strangers — every one arrives from somebody they already
// work with, which means "discovering" a new company on a document discovers
// nothing. All it produced was a list of names the agent already knew, mixed
// with servicers and mortgagee boxes it took a denylist to suppress.
//
// What survived is the part that was never about discovery:
//
//   1. A PERSON missing from a partner the agent already has. Cowart is set
//      up; a new loan officer on their team sends a file; her leads land
//      unattributed and she gets no updates. The agent cannot see this on
//      their own, and the document genuinely knows it.
//
//   2. A lender a REALTOR named on their deal (see lib/realtor). That's an
//      introduction someone made on purpose, not a name scraped off a form.
//
// Everything here is best-effort — none of it may ever break an upload or an
// extraction.

export const PROSPECT_STATUSES: Record<string, string> = {
  idea: "Idea",
  reached_out: "Reached out",
  meeting: "Meeting set",
  link_sent: "Link sent",
  passed: "Not a fit",
};

// Loose match: "Summit Home Loans, LLC" and "summit home loans" are the same
// company. Used to avoid suggesting someone who's already a partner.
export function loose(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\b(llc|inc|incorporated|co|corp|company|group|team|the|of|and)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Loan servicers and lienholder shells. These appear as the mortgagee on
// insurance documents and are never referral partners — nobody at Mr. Cooper is
// sending an agent a buyer. Kept as a last line of defence behind the document
// filter, because one bad prospect makes the whole feature feel guessy.
const SERVICER_PATTERNS = [
  /isaoa/i,
  /atima/i,
  /\bits\s+successors\b/i,
  /loan\s*care/i,
  /servicemac/i,
  /mr\.?\s*cooper/i,
  /nationstar/i,
  /cenlar/i,
  /dovenmuehle/i,
  /shellpoint/i,
  /freedom\s+mortgage/i,
  /select\s+portfolio/i,
  /lakeview\s+loan/i,
  /rushmore/i,
  /planet\s+home/i,
  /\bservicing\b/i,
  /\bsecuritiz/i,
  /\btrustee\b/i,
];

export function looksLikeServicer(v: string | null | undefined): boolean {
  const t = String(v ?? "");
  if (!t.trim()) return false;
  return SERVICER_PATTERNS.some((re) => re.test(t));
}

export type DocContact = {
  loan_officer_name?: string | null;
  loan_officer_company?: string | null;
  loan_officer_email?: string | null;
  loan_officer_phone?: string | null;
  loan_officer_nmls?: string | null;
};

// Record (or bump) a person found on a document who belongs to a partner the
// agent ALREADY has, but who isn't on that partner's team contact list.
//
// Deliberately narrow. If the company on the document isn't already a partner,
// nothing happens — a document from a company the agent hasn't set up is a
// document from someone they know and chose not to add, not a discovery.
export async function recordContactFromDoc(accountId: string, extracted: DocContact): Promise<void> {
  try {
    const name = String(extracted.loan_officer_name ?? "").trim() || null;
    const company = String(extracted.loan_officer_company ?? "").trim() || null;
    // Without a person's name there is no contact to add. A bare company name
    // on a document is usually a mortgagee box.
    if (!name) return;
    if (looksLikeServicer(company) || looksLikeServicer(name)) return;

    const { data: partners } = await db().from("partners").select("id, name").eq("account_id", accountId);
    const matchedPartner = (partners ?? []).find(
      (p) => (company && loose(p.name) === loose(company)) || loose(p.name) === loose(name)
    );
    // No existing partner → nothing to say. This is the branch that used to
    // invent prospects.
    if (!matchedPartner) return;

    const email = String(extracted.loan_officer_email ?? "").trim() || null;
    const { data: contacts } = await db()
      .from("partner_contacts")
      .select("name, email")
      .eq("partner_id", matchedPartner.id);
    const known = (contacts ?? []).some(
      (c) => loose(c.name) === loose(name) || (email && String(c.email).toLowerCase() === email.toLowerCase())
    );
    if (known) return;

    const { data: already } = await db()
      .from("partner_prospects")
      .select("id, deal_count")
      .eq("account_id", accountId)
      .eq("source", "contact")
      .eq("suggested_partner_id", matchedPartner.id)
      .ilike("name", name)
      .maybeSingle();
    if (already) {
      await db()
        .from("partner_prospects")
        .update({ deal_count: (already.deal_count ?? 0) + 1, last_seen_at: new Date().toISOString() })
        .eq("id", already.id);
      return;
    }

    await db().from("partner_prospects").insert({
      account_id: accountId,
      name,
      company: matchedPartner.name,
      email,
      phone: extracted.loan_officer_phone ?? null,
      nmls: extracted.loan_officer_nmls ?? null,
      source: "contact",
      status: "idea",
      suggested_partner_id: matchedPartner.id,
      deal_count: 1,
      last_seen_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("partner gaps: contact record failed", e);
  }
}

// The mirror: how concentrated is this agent's referral flow? Honest framing
// only — we report their own distribution, never a promise about fixing it.
export function concentration(
  rows: { partner_id: string | null }[],
  partnerNames: Map<string, string>
): { total: number; topName: string | null; topShare: number; partnersWithReferrals: number } {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.partner_id) continue;
    counts.set(r.partner_id, (counts.get(r.partner_id) ?? 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  let topId: string | null = null;
  let topCount = 0;
  for (const [id, n] of counts) {
    if (n > topCount) {
      topCount = n;
      topId = id;
    }
  }
  return {
    total,
    topName: topId ? partnerNames.get(topId) ?? null : null,
    topShare: total > 0 ? Math.round((topCount / total) * 100) : 0,
    partnersWithReferrals: counts.size,
  };
}
