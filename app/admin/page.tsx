"use client";

import { useEffect, useState } from "react";
import { TopNav } from "../components";

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", agency: "Agency" };

// Founder dashboard: signups, paying customers, MRR, running costs, ROI, and
// a per-account roll-up. Doubles as the live-demo view — real numbers, live.

type Summary = {
  totals: {
    accounts: number;
    owners: number;
    teamMembers: number;
    byPlan: Record<string, number>;
    paying: number;
    viaStripe: number;
    founderAnnual: number;
    mrr: number;
    partners: number;
    referrals: number;
    fromPortal: number;
    bound: number;
    premiumTracked: number;
    emailsSent30d: number;
    emailsFailed30d: number;
    feedback30d: number;
  };
  signups14d: { label: string; count: number }[];
  accounts: {
    email: string;
    plan: string;
    annual: boolean;
    isMember: boolean;
    partners: number;
    referrals: number;
    bound: number;
    created_at: string;
  }[];
};

export default function AdminPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [denied, setDenied] = useState(false);
  const [cost, setCost] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/summary").then(async (r) => {
      if (r.status === 403) setDenied(true);
      else if (r.ok) setData(await r.json());
    });
    try {
      setCost(window.localStorage.getItem("rb_admin_monthly_cost") ?? "");
    } catch {}
  }, []);

  function saveCost(v: string) {
    setCost(v);
    try {
      window.localStorage.setItem("rb_admin_monthly_cost", v);
    } catch {}
  }

  if (denied) {
    return (
      <>
        <TopNav />
        <main className="max-w-2xl mx-auto p-6">
          <div className="card p-10 text-center text-ink-muted">
            This page is for the ReferBound founder account.
          </div>
        </main>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <TopNav />
        <main className="max-w-2xl mx-auto p-6">
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        </main>
      </>
    );
  }

  const t = data.totals;
  const monthlyCost = Number(cost) || 0;
  const net = t.mrr - monthlyCost;
  const maxSignups = Math.max(1, ...data.signups14d.map((d) => d.count));

  return (
    <>
      <TopNav />
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Founder dashboard</h1>
          <p className="text-sm text-ink-secondary mt-1">
            The business, live. Nothing here is visible to any other account.
          </p>
        </div>

        {/* Money row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              v: `$${t.mrr.toLocaleString()}`,
              l: "MRR",
              hint: `${t.paying} paying · ${t.viaStripe} via Stripe${t.founderAnnual ? ` · ${t.founderAnnual} founding annual` : ""}`,
            },
            { v: String(t.accounts), l: "Accounts", hint: `${t.owners} owners · ${t.teamMembers} team seats` },
            {
              v: `${t.byPlan.free ?? 0} / ${t.byPlan.pro ?? 0} / ${t.byPlan.agency ?? 0}`,
              l: "Free / Pro / Agency",
            },
            {
              v: net >= 0 ? `+$${net.toLocaleString()}` : `-$${Math.abs(net).toLocaleString()}`,
              l: "Net / month",
              hint: monthlyCost ? `after $${monthlyCost} costs` : "set costs below",
              good: net > 0,
            },
          ].map((x: any) => (
            <div key={x.l} className="card px-4 py-3.5">
              <p className={`text-xl font-semibold tracking-tight ${x.good ? "text-emerald-600" : ""}`}>{x.v}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{x.l}</p>
              {x.hint && <p className="text-[11px] text-ink-muted mt-0.5">{x.hint}</p>}
            </div>
          ))}
        </div>

        {/* Signups chart + ROI */}
        <div className="grid sm:grid-cols-[1fr_260px] gap-4">
          <section className="card p-5">
            <h2 className="section-label mb-3">Signups — last 14 days</h2>
            <div className="flex items-end gap-1.5 h-24">
              {data.signups14d.map((d) => (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-brand"
                    style={{ height: `${Math.max(d.count > 0 ? 10 : 2, (d.count / maxSignups) * 88)}px` }}
                    title={`${d.label}: ${d.count}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-ink-muted mt-1.5">
              <span>{data.signups14d[0]?.label}</span>
              <span>{data.signups14d[data.signups14d.length - 1]?.label}</span>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-label mb-2">Running costs</h2>
            <label className="block">
              <span className="text-xs text-ink-secondary">Monthly cost ($)</span>
              <input
                className="input mt-1.5"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 45"
                value={cost}
                onChange={(e) => saveCost(e.target.value)}
              />
            </label>
            <p className="text-[11px] text-ink-muted mt-2">
              Domains, Anthropic credits, Vercel/Supabase/Resend if upgraded. Saved on this
              device; used for the Net figure above.
            </p>
          </section>
        </div>

        {/* Ops row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { v: String(t.partners), l: "Partners on portals" },
            { v: `${t.referrals} · ${t.fromPortal} via portal`, l: "Referrals" },
            { v: `${t.bound} bound · $${t.premiumTracked.toLocaleString()}`, l: "Premium tracked" },
            {
              v: `${t.emailsSent30d} ✓ · ${t.emailsFailed30d} ✗`,
              l: "Emails, 30d",
              hint: t.feedback30d ? `${t.feedback30d} feedback notes` : undefined,
            },
          ].map((x: any) => (
            <div key={x.l} className="card px-4 py-3.5">
              <p className="text-sm font-semibold tracking-tight">{x.v}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{x.l}</p>
              {x.hint && <p className="text-[11px] text-brand mt-0.5">{x.hint}</p>}
            </div>
          ))}
        </div>

        {/* Accounts table */}
        <section className="card p-5 overflow-x-auto">
          <h2 className="section-label mb-3">Accounts · newest first</h2>
          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="pb-2 font-semibold">Email</th>
                <th className="pb-2 font-semibold">Plan</th>
                <th className="pb-2 font-semibold text-right">Partners</th>
                <th className="pb-2 font-semibold text-right">Referrals</th>
                <th className="pb-2 font-semibold text-right">Bound</th>
                <th className="pb-2 font-semibold text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.accounts.map((a) => (
                <tr key={a.email}>
                  <td className="py-2 pr-3 truncate max-w-[220px]">{a.email}</td>
                  <td className="py-2 pr-3">
                    <span className={`badge ${a.plan === "free" ? "bg-slate-100 text-slate-700" : "bg-brand-light text-brand-700"}`}>
                      {a.isMember
                        ? "team seat"
                        : a.annual
                          ? `${PLAN_LABELS[a.plan] ?? a.plan} · annual`
                          : (PLAN_LABELS[a.plan] ?? a.plan)}
                    </span>
                  </td>
                  <td className="py-2 text-right">{a.partners}</td>
                  <td className="py-2 text-right">{a.referrals}</td>
                  <td className="py-2 text-right">{a.bound}</td>
                  <td className="py-2 text-right text-xs text-ink-muted">{a.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
