import { SAFE_STATUSES } from "@/lib/config";

// NOTE: this module is imported by client components (the partners page, the
// stats ledger), so it must stay free of anything server-only. The query that
// actually builds the ledger lives in lib/ledger.ts for exactly that reason —
// importing lib/db from here would drag the service-role client into the
// browser bundle.

// Where business comes from, and what it produced.
//
// The model change that makes everything else fall out: a referral already
// belongs to a partner, so a partner row IS the source. A lead vendor is a
// source you pay. A referring client is a source you earned. A lender is a
// source you built. Same table, three kinds, three treatments.
//
// This is what unblocked the cold start. Nobody needs a lender on day one —
// they need one closed client and a prompt.

export const SOURCE_KINDS = {
  partner: "Referral partner",
  paid: "Paid leads",
  client: "Client who refers",
} as const;

export type SourceKind = keyof typeof SOURCE_KINDS;

// Only a real relationship gets a portal. A lead vendor has nothing to look at
// and no reason to log in; handing one a magic link would be absurd.
export const PORTAL_KINDS: SourceKind[] = ["partner"];

// Paid is money. Everything else is a relationship. That distinction is the
// product's whole argument, so it lives in one function rather than being
// re-derived in six places.
export function isEarned(kind: string | null | undefined): boolean {
  return (kind ?? "partner") !== "paid";
}

export function sourceLabel(kind: string | null | undefined): string {
  return SOURCE_KINDS[(kind ?? "partner") as SourceKind] ?? "Referral partner";
}

// ── The ladder ──────────────────────────────────────────────────────────────
//
// Derived, never stored. A stored rung is a rung that goes stale the moment
// someone sends their second referral, and the whole point is to catch that
// moment.

export type Rung = "client" | "referring" | "repeat" | "partner";

export const RUNGS: Record<Rung, { label: string; next: string | null }> = {
  client: { label: "Client", next: "Ask them for a referral" },
  referring: { label: "Referring client", next: "Thank them — and watch for a second" },
  repeat: { label: "Repeat referrer", next: "Give them a partner portal" },
  partner: { label: "Standing partner", next: null },
};

export function rungFor(kind: string | null | undefined, referralCount: number): Rung {
  if ((kind ?? "partner") === "partner") return "partner";
  if (referralCount >= 2) return "repeat";
  if (referralCount >= 1) return "referring";
  return "client";
}

// The moment worth catching: a client source just sent their second. They are
// not a client any more and the agent almost certainly hasn't noticed.
export function readyToPromote(kind: string | null | undefined, referralCount: number): boolean {
  return (kind ?? "partner") === "client" && referralCount >= 2;
}

// ── Earned share ────────────────────────────────────────────────────────────
//
// The producer's number. Their own data, no benchmark, and it only moves when
// they do the work. Counts POLICIES WRITTEN, not leads worked — a producer who
// quoted forty and bound six has an earned share about those six.

export type EarnedShare = {
  total: number;
  earned: number;
  paid: number;
  percent: number | null; // null when nothing is bound yet — never show 0% to a new user
};

export function earnedShare(
  rows: { status: string; source_kind?: string | null }[]
): EarnedShare {
  const won = rows.filter((r) => SAFE_STATUSES.includes(r.status));
  const earned = won.filter((r) => isEarned(r.source_kind)).length;
  const total = won.length;
  return {
    total,
    earned,
    paid: total - earned,
    percent: total > 0 ? Math.round((earned / total) * 100) : null,
  };
}

// ── The ledger ──────────────────────────────────────────────────────────────
//
// One row per source: what it cost, what it wrote, and what those clients went
// on to produce. Deliberately no close-rate column — that would require
// logging every lead bought, which nobody will do and which the product does
// not need. See the thesis.

export type LedgerRow = {
  id: string;
  name: string;
  kind: SourceKind;
  spendMonthlyCents: number | null;
  monthsActive: number;
  spendToDateCents: number | null;
  policies: number; // bound and still on the books, direct from this source
  lapsed: number; // written from this source and since cancelled
  downstream: number; // bound policies whose parent client came from this source
  costPerPolicyCents: number | null; // spend to date over direct + downstream
  costDirectOnlyCents: number | null; // the same number before the referrals count
};

export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
