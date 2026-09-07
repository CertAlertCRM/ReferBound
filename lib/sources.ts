import { db } from "@/lib/db";
import { SAFE_STATUSES } from "@/lib/config";

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
  spendCents: number | null;
  policies: number; // bound, direct from this source
  downstream: number; // bound policies whose parent came from this source
  costPerPolicyCents: number | null;
};

export async function sourceLedger(accountId: string): Promise<LedgerRow[]> {
  const [{ data: partners }, { data: refs }] = await Promise.all([
    db()
      .from("partners")
      .select("id, name, source_kind, monthly_spend_cents")
      .eq("account_id", accountId),
    db()
      .from("referrals")
      .select("id, partner_id, status, parent_referral_id")
      .eq("account_id", accountId),
  ]);

  const rows = (refs ?? []) as any[];
  const won = rows.filter((r) => SAFE_STATUSES.includes(r.status));
  const sourceOf = new Map<string, string>(rows.map((r) => [r.id, r.partner_id]));

  const direct = new Map<string, number>();
  const downstream = new Map<string, number>();
  for (const r of won) {
    direct.set(r.partner_id, (direct.get(r.partner_id) ?? 0) + 1);
    // Credit the ORIGINAL source with what its client went on to produce.
    // One hop is deliberate: a second-generation referral belongs to the person
    // who made it, not to the lead vendor three steps back. Crediting the whole
    // chain to the vendor would flatter the number and nobody would believe it.
    const parentSource = r.parent_referral_id ? sourceOf.get(r.parent_referral_id) : null;
    if (parentSource) downstream.set(parentSource, (downstream.get(parentSource) ?? 0) + 1);
  }

  return ((partners ?? []) as any[])
    .map((p) => {
      const policies = direct.get(p.id) ?? 0;
      const down = downstream.get(p.id) ?? 0;
      const spend = p.monthly_spend_cents ?? null;
      const all = policies + down;
      return {
        id: p.id,
        name: p.name,
        kind: (p.source_kind ?? "partner") as SourceKind,
        spendCents: spend,
        policies,
        downstream: down,
        costPerPolicyCents: spend && all > 0 ? Math.round(spend / all) : null,
      };
    })
    .sort((a, b) => b.policies + b.downstream - (a.policies + a.downstream));
}

export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
