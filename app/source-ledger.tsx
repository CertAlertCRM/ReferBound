"use client";

import { useEffect, useState } from "react";
import { money, sourceLabel, type LedgerRow } from "@/lib/sources";

// Where the business came from.
//
// One table, and one sentence underneath it that is the actual point: what a
// paid source costs per policy once you count the referrals its clients sent.
// If that sentence never gets to appear, the agent has not been asking, which
// is itself the finding.

export function SourceLedger() {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);

  useEffect(() => {
    fetch("/api/ledger").then(async (r) => {
      if (r.ok) setRows((await r.json()).rows ?? []);
    });
  }, []);

  if (!rows || rows.length === 0) return null;

  const paid = rows.filter((r) => r.kind === "paid");
  const paidSpend = paid.reduce((a, r) => a + (r.spendToDateCents ?? 0), 0);
  const paidDirect = paid.reduce((a, r) => a + r.policies, 0);
  const paidDown = paid.reduce((a, r) => a + r.downstream, 0);

  const withRefs = paidSpend > 0 && paidDirect + paidDown > 0
    ? Math.round(paidSpend / (paidDirect + paidDown))
    : null;
  const withoutRefs = paidSpend > 0 && paidDirect > 0 ? Math.round(paidSpend / paidDirect) : null;

  return (
    <section className="card p-5">
      <h2 className="section-label mb-1">Where the business came from</h2>
      <p className="text-xs text-ink-muted mb-4">
        Policies written by source, plus what the clients from that source went on to send you.
        Spend is estimated from the monthly figure over the time the source has existed.
      </p>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="font-semibold pb-2">Source</th>
              <th className="font-semibold pb-2 text-right">Spend</th>
              <th className="font-semibold pb-2 text-right">Written</th>
              <th className="font-semibold pb-2 text-right">They sent</th>
              <th className="font-semibold pb-2 text-right">Per policy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2.5 pr-3">
                  <p className="font-medium truncate max-w-[180px]">{r.name}</p>
                  <p className="text-[11px] text-ink-muted">{sourceLabel(r.kind)}</p>
                </td>
                <td className="py-2.5 text-right tabnum">
                  {r.spendMonthlyCents != null ? (
                    <>
                      <span>{money(r.spendToDateCents)}</span>
                      <span className="block text-[11px] text-ink-muted">
                        {money(r.spendMonthlyCents)}/mo · {r.monthsActive}mo
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right tabnum">{r.policies}</td>
                <td className="py-2.5 text-right tabnum">
                  {r.downstream > 0 ? (
                    <span className="text-emerald-700 font-medium">+{r.downstream}</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right tabnum">
                  {r.costPerPolicyCents != null ? money(r.costPerPolicyCents) : <span className="text-ink-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {withRefs != null && withoutRefs != null && paidDown > 0 && (
        <p className="text-xs text-ink-secondary mt-4 rounded-lg bg-emerald-50 px-3 py-2.5">
          Counting the {paidDown} {paidDown === 1 ? "policy" : "policies"} those clients went on to
          send you, your paid leads cost <span className="font-semibold">{money(withRefs)}</span> a
          policy rather than {money(withoutRefs)}.
        </p>
      )}
      {paidDirect > 0 && paidDown === 0 && (
        <p className="text-xs text-ink-secondary mt-4 rounded-lg bg-slate-50 px-3 py-2.5">
          None of your paid-lead clients have sent anyone yet. That is the cheapest business
          available to you and it is currently costing you nothing to ignore.
        </p>
      )}

      <p className="text-[11px] text-ink-muted mt-3">
        A policy can appear in two rows: once under the source that wrote it, and once in the
        &ldquo;they sent&rdquo; column of whoever produced the client who referred it. Credit only
        travels one hop.
      </p>
    </section>
  );
}
