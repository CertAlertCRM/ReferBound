"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS } from "@/lib/config";
import { TopNav } from "../components";

type Stats = {
  total: number;
  byStatus: Record<string, number>;
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
