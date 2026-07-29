"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS } from "@/lib/config";
import { TopNav } from "../components";

type Stats = {
  total: number;
  byStatus: Record<string, number>;
  premiumTotal: number;
  partnerBreakdown: {
    name: string;
    premium: number;
    referred: number;
    bound: number;
    lost: number;
    closeRatio: number | null;
    avgDaysToBound: number | null;
  }[];
  monthly: { label: string; referred: number; bound: number; premium: number }[];
  fromPartnerPortal: number;
  avgLogSeconds: number | null;
  avgHoursToBound: number | null;
  conversionRate: number | null;
  emailsSent: number;
  emailsLogged: number;
  statusUpdates: number;
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then(async (r) => r.ok && setStats(await r.json()));
  }, []);

  if (!stats) {
    return (
      <>
        <TopNav active="stats" />
        <main className="max-w-2xl mx-auto p-6">
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        </main>
      </>
    );
  }

  const tiles: { label: string; value: string; hint?: string }[] = [
    {
      label: "Premium sourced from partners",
      value: stats.premiumTotal > 0 ? `$${Math.round(stats.premiumTotal).toLocaleString()}` : "—",
      hint: "Bound deals with a premium recorded on the deal page",
    },
    {
      label: "Avg time to log a lead",
      value: stats.avgLogSeconds !== null ? `${stats.avgLogSeconds}s` : "—",
      hint: "From opening the form to saving",
    },
    {
      label: "Avg time to bound",
      value:
        stats.avgHoursToBound !== null
          ? stats.avgHoursToBound > 48
            ? `${Math.round(stats.avgHoursToBound / 24)}d`
            : `${stats.avgHoursToBound}h`
          : "—",
    },
    {
      label: "Bound rate of closed",
      value: stats.conversionRate !== null ? `${stats.conversionRate}%` : "—",
    },
    { label: "Total referrals", value: String(stats.total) },
    { label: "Sent via partner portal", value: String(stats.fromPartnerPortal) },
    { label: "Status updates logged", value: String(stats.statusUpdates) },
    {
      label: "Partner emails sent",
      value: String(stats.emailsSent),
      hint:
        stats.emailsLogged > stats.emailsSent
          ? `${stats.emailsLogged - stats.emailsSent} logged, not sent (email not configured)`
          : undefined,
    },
  ];

  const pipelineTotal = Object.values(stats.byStatus).reduce((a, b) => a + b, 0) || 1;

  return (
    <>
      <TopNav active="stats" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pilot metrics</h1>
          <p className="text-sm text-ink-secondary mt-1">The numbers that answer whether this is working.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="card p-4">
              <p className="text-[26px] leading-8 font-semibold tracking-tight">{t.value}</p>
              <p className="text-xs text-ink-secondary mt-1">{t.label}</p>
              {t.hint && <p className="text-[10px] text-ink-muted mt-1">{t.hint}</p>}
            </div>
          ))}
        </div>

        {stats.monthly.some((m) => m.referred > 0 || m.bound > 0) && (
          <section className="card p-5">
            <h2 className="section-label mb-1">Last 6 months</h2>
            <p className="text-xs text-ink-muted mb-4">
              Referred vs bound per month — premium credited to the month it bound.
            </p>
            {(() => {
              const max = Math.max(1, ...stats.monthly.map((m) => Math.max(m.referred, m.bound)));
              return (
                <div className="grid grid-cols-6 gap-2 items-end">
                  {stats.monthly.map((m) => (
                    <div key={m.label} className="flex flex-col items-center gap-1.5">
                      <p className="text-[10px] font-semibold text-ink h-4">
                        {m.premium > 0 ? `$${Math.round(m.premium / 100) / 10}k` : ""}
                      </p>
                      <div className="flex items-end gap-1 h-24 w-full justify-center">
                        <div
                          className="w-3.5 rounded-t bg-brand-200"
                          style={{ height: `${Math.max(m.referred > 0 ? 8 : 2, (m.referred / max) * 96)}px` }}
                          title={`${m.referred} referred`}
                        />
                        <div
                          className="w-3.5 rounded-t bg-brand"
                          style={{ height: `${Math.max(m.bound > 0 ? 8 : 2, (m.bound / max) * 96)}px` }}
                          title={`${m.bound} bound`}
                        />
                      </div>
                      <p className="text-[10px] text-ink-muted">{m.label}</p>
                      <p className="text-[10px] text-ink-secondary -mt-1">
                        {m.referred}·{m.bound}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand-200 inline-block" /> Referred
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand inline-block" /> Bound
              </span>
            </div>
          </section>
        )}

        {stats.partnerBreakdown.length > 0 && (
          <section className="card p-5">
            <h2 className="section-label mb-1">Partner ROI</h2>
            <p className="text-xs text-ink-muted mb-3">
              Which relationships are worth the coffee meetings — never shown to partners.
            </p>
            <ul className="divide-y divide-slate-100">
              {stats.partnerBreakdown.map((p) => (
                <li key={p.name} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-ink">{p.name}</span>
                    <span className="text-sm font-semibold text-ink">
                      {p.premium > 0 ? `$${Math.round(p.premium).toLocaleString()}` : "$0"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-ink-secondary">
                    <span>{p.referred} referred</span>
                    <span>{p.bound} bound</span>
                    {p.closeRatio !== null && (
                      <span
                        className={
                          p.closeRatio >= 50 ? "text-emerald-600 font-medium" : undefined
                        }
                      >
                        {p.closeRatio}% close ratio
                      </span>
                    )}
                    {p.avgDaysToBound !== null && <span>{p.avgDaysToBound}d avg to bind</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-5">
          <h2 className="section-label mb-3">Pipeline</h2>
          <ul className="space-y-2.5">
            {Object.entries(stats.byStatus).map(([k, v]) => (
              <li key={k}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-ink-secondary">{STATUS_LABELS[k] ?? k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(4, (v / pipelineTotal) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
