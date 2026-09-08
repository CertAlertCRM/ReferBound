import { db } from "@/lib/db";
import { SAFE_STATUSES } from "@/lib/config";
import type { LedgerRow, SourceKind } from "@/lib/sources";

// The ledger query. Server-only: it holds the service-role client, which is
// why it does not live in lib/sources.ts alongside the pure helpers that the
// partners page and the stats table import directly.

const MONTH = 1000 * 60 * 60 * 24 * 30.44;

export async function sourceLedger(accountId: string): Promise<LedgerRow[]> {
  const [{ data: partners }, { data: refs }] = await Promise.all([
    db()
      .from("partners")
      .select("id, name, source_kind, monthly_spend_cents, created_at")
      .eq("account_id", accountId),
    db()
      .from("referrals")
      .select("id, partner_id, status, parent_referral_id, lapsed_at")
      .eq("account_id", accountId),
  ]);

  const rows = (refs ?? []) as any[];
  // Written, and still on the books. A policy that lapsed at six months cost
  // the same to acquire and produced a fraction of the value, so a cost per
  // policy that keeps counting it forever is a number an owner stops trusting.
  const written = rows.filter((r) => SAFE_STATUSES.includes(r.status));
  const won = written.filter((r) => !r.lapsed_at);
  const sourceOf = new Map<string, string>(rows.map((r) => [r.id, r.partner_id] as [string, string]));

  const lapsedBySource = new Map<string, number>();
  for (const r of written) {
    if (r.lapsed_at) lapsedBySource.set(r.partner_id, (lapsedBySource.get(r.partner_id) ?? 0) + 1);
  }

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
      const lapsed = lapsedBySource.get(p.id) ?? 0;
      const down = downstream.get(p.id) ?? 0;
      const monthly = p.monthly_spend_cents ?? null;

      // Spend is recorded per month; policies accumulate for as long as the
      // source has existed. Dividing one by the other directly would be
      // nonsense, so estimate what has actually been spent since the source
      // was added. It is an estimate and the UI says so.
      const monthsActive = Math.max(
        1,
        Math.round((Date.now() - new Date(p.created_at).getTime()) / MONTH)
      );
      const toDate = monthly != null ? monthly * monthsActive : null;

      return {
        id: p.id,
        name: p.name,
        kind: (p.source_kind ?? "partner") as SourceKind,
        spendMonthlyCents: monthly,
        monthsActive,
        spendToDateCents: toDate,
        policies,
        lapsed,
        downstream: down,
        costPerPolicyCents:
          toDate != null && policies + down > 0 ? Math.round(toDate / (policies + down)) : null,
        costDirectOnlyCents: toDate != null && policies > 0 ? Math.round(toDate / policies) : null,
      };
    })
    .sort((a, b) => b.policies + b.downstream - (a.policies + a.downstream));
}
