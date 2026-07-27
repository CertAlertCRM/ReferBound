"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/config";

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
      <main className="max-w-2xl mx-auto p-6">
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: "Total referrals", value: String(stats.total) },
    {
      label: "Avg time to log a lead",
      value: stats.avgLogSeconds !== null ? `${stats.avgLogSeconds}s` : "—",
      hint: "Measured from opening the form to saving",
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
      label: "Bound rate (of closed)",
      value: stats.conversionRate !== null ? `${stats.conversionRate}%` : "—",
    },
    { label: "Submitted via partner portal", value: String(stats.fromPartnerPortal) },
    { label: "Status updates logged", value: String(stats.statusUpdates) },
    {
      label: "Partner emails sent",
      value: `${stats.emailsSent}`,
      hint: stats.emailsLogged > stats.emailsSent ? `${stats.emailsLogged - stats.emailsSent} logged but not sent (email not configured?)` : undefined,
    },
  ];

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <Link href="/" className="text-sm text-brand">← Back to referrals</Link>
      <h1 className="text-2xl font-bold">Pilot metrics</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-2xl font-bold">{t.value}</p>
            <p className="text-xs text-slate-500 mt-1">{t.label}</p>
            {t.hint && <p className="text-[10px] text-slate-400 mt-1">{t.hint}</p>}
          </div>
        ))}
      </div>

      <section className="card p-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-500 mb-2">Pipeline</h2>
        <ul className="space-y-1 text-sm">
          {Object.entries(stats.byStatus).map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span>{STATUS_LABELS[k] ?? k}</span>
              <span className="font-semibold">{v}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
