import { db } from "@/lib/db";

// Referral Radar: turn documents the agent already uploads into a warm list of
// people who have sent them business but were never set up as partners.
// Everything here is best-effort — radar must never break an upload or an
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

export type DocContact = {
  loan_officer_name?: string | null;
  loan_officer_company?: string | null;
  loan_officer_email?: string | null;
  loan_officer_phone?: string | null;
  loan_officer_nmls?: string | null;
};

// Record (or bump) someone found on a document. Two useful cases:
//   1. Their company isn't a partner yet → a portal that should exist.
//   2. Their company IS a partner but they're not on its team contact list →
//      their leads land unattributed and they get no updates. This one the
//      agent can't easily spot on their own.
// Silent when there's nothing usable or they're already fully set up.
export async function recordProspectFromDoc(accountId: string, extracted: DocContact): Promise<void> {
  try {
    const name = String(extracted.loan_officer_name ?? "").trim() || null;
    const company = String(extracted.loan_officer_company ?? "").trim() || null;
    if (!name && !company) return;

    const { data: partners } = await db().from("partners").select("id, name").eq("account_id", accountId);
    const matchedPartner = (partners ?? []).find(
      (p) => (company && loose(p.name) === loose(company)) || (name && loose(p.name) === loose(name))
    );

    // ── Case 2: known partner, unknown person on their team ──────────────────
    if (matchedPartner) {
      if (!name) return; // company already has a portal; nothing to add
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
      return;
    }

    // ── Case 1: a working relationship with no portal yet ────────────────────

    // Already tracked? Bump the deal count — "you've worked 3 deals with them"
    // is what makes the suggestion land.
    const { data: existing } = await db()
      .from("partner_prospects")
      .select("id, deal_count, name, company, email, phone, nmls")
      .eq("account_id", accountId)
      .limit(200);
    const match = (existing ?? []).find(
      (p) =>
        (company && loose(p.company) === loose(company)) ||
        (name && company === null && loose(p.name) === loose(name))
    );

    if (match) {
      await db()
        .from("partner_prospects")
        .update({
          deal_count: (match.deal_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
          // Fill blanks we learn later without overwriting anything.
          name: match.name ?? name,
          email: match.email ?? extracted.loan_officer_email ?? null,
          phone: match.phone ?? extracted.loan_officer_phone ?? null,
          nmls: match.nmls ?? extracted.loan_officer_nmls ?? null,
        })
        .eq("id", match.id);
      return;
    }

    await db().from("partner_prospects").insert({
      account_id: accountId,
      name,
      company,
      email: extracted.loan_officer_email ?? null,
      phone: extracted.loan_officer_phone ?? null,
      nmls: extracted.loan_officer_nmls ?? null,
      partner_type: "lender",
      source: "radar",
      status: "idea",
      deal_count: 1,
      last_seen_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("radar: prospect record failed", e);
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
