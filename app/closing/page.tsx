"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopNav, StatusBadge } from "../components";
import { SAFE_STATUSES, STATUS_LABELS, statusLabel, isFullTrack } from "@/lib/config";
import { IconAlert, IconCheck, IconArrowRight } from "../icons";
import { SkeletonPage } from "../skeleton";

// Closing week.
//
// An LO's opinion of an agent is formed in the seventy-two hours before
// funding. Everything else is forgiven; a file that isn't ready on closing day
// is not. This is that window on one screen, with exactly what's missing on
// each deal — the difference between finding out Thursday and finding out from
// the loan officer.

type Ref = {
  id: string;
  client_name: string;
  closing_date: string | null;
  status: string;
  premium: number | null;
  backfilled?: boolean;
  partners: { name: string; partner_type?: string } | null;
  documents: { id: string; kind: string; purged_at?: string | null }[];
  doc_check?: any;
  closing_date_was?: string | null;
  closing_date_changed_at?: string | null;
};

const DAY = 86400000;

export default function ClosingWeekPage() {
  const [refs, setRefs] = useState<Ref[] | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetch("/api/referrals").then(async (r) => r.ok && setRefs((await r.json()).referrals ?? []));
  }, []);

  const groups = useMemo(() => {
    if (!refs) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = today.getTime() + days * DAY;

    const inWindow = refs
      .filter((r) => {
        if (r.status === "lost" || r.backfilled) return false;
        if (!r.closing_date) return false;
        const t = new Date(`${r.closing_date}T12:00:00`).getTime();
        return t <= horizon;
      })
      .sort((a, b) => String(a.closing_date).localeCompare(String(b.closing_date)));

    const byDate = new Map<string, Ref[]>();
    for (const r of inWindow) {
      const list = byDate.get(r.closing_date!) ?? [];
      list.push(r);
      byDate.set(r.closing_date!, list);
    }
    return Array.from(byDate.entries());
  }, [refs, days]);

  // What still has to happen before this file is genuinely done.
  function gaps(r: Ref): { label: string; hard: boolean }[] {
    const out: { label: string; hard: boolean }[] = [];
    const full = isFullTrack(r.partners?.partner_type);
    const docs = (r.documents ?? []).filter((d) => !d.purged_at);
    const hasEoi = docs.some((d) => d.kind === "eoi");

    if (!SAFE_STATUSES.includes(r.status)) out.push({ label: "not covered yet", hard: true });

    // Everything below this line is lender paperwork. A realtor's referral has
    // no EOI to deliver and no mortgagee clause to check — flagging it as
    // incomplete would be inventing work that doesn't exist.
    if (full) {
      if (!hasEoi) out.push({ label: "no EOI uploaded", hard: true });
      if (r.status === "bound") out.push({ label: "docs not delivered", hard: true });
      if (hasEoi && !r.doc_check) out.push({ label: "pre-delivery check not run", hard: false });
      if (r.doc_check?.blockers > 0) {
        out.push({ label: `${r.doc_check.blockers} unresolved on the check`, hard: true });
      }
    }
    if (!r.premium) out.push({ label: "no premium recorded", hard: false });
    return out;
  }

  if (!refs) {
    return (
      <>
        <TopNav active="closing" />
        <main className="max-w-3xl mx-auto p-4 sm:p-6">
          <SkeletonPage tiles={3} rows={3} />
        </main>
      </>
    );
  }

  const all = groups.flatMap(([, list]) => list);
  const clean = all.filter((r) => gaps(r).filter((g) => g.hard).length === 0).length;
  const atRisk = all.length - clean;
  const overdue = all.filter(
    (r) => new Date(`${r.closing_date}T12:00:00`).getTime() < Date.now() && !SAFE_STATUSES.includes(r.status)
  ).length;

  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / DAY);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    if (diff < 0) return { text: weekday, note: `${Math.abs(diff)}d past`, urgent: true };
    if (diff === 0) return { text: "Today", note: weekday, urgent: true };
    if (diff === 1) return { text: "Tomorrow", note: weekday, urgent: true };
    return { text: weekday, note: `in ${diff} days`, urgent: diff <= 3 };
  };

  return (
    <>
      <TopNav active="closing" />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Closing week</h1>
            <p className="text-sm text-ink-secondary mt-1">
              Every file with a closing date inside the window, and exactly what&apos;s still open
              on each one.
            </p>
          </div>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  days === d ? "bg-brand text-white" : "text-ink-secondary hover:bg-slate-100"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 stagger">
          {[
            { v: String(all.length), l: "Closing in window" },
            { v: String(atRisk), l: "Need attention", alert: atRisk > 0 },
            { v: String(overdue), l: "Past closing, not bound", alert: overdue > 0 },
          ].map((t: any) => (
            <div key={t.l} className={`card card-hover px-4 py-3 ${t.alert ? "border-red-200" : ""}`}>
              <p className={`tabnum text-xl font-semibold tracking-tight ${t.alert ? "text-red-600" : ""}`}>{t.v}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">{t.l}</p>
            </div>
          ))}
        </div>

        {all.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="font-semibold">Nothing closing in the next {days} days</p>
            <p className="text-sm text-ink-secondary mt-1">
              When a partner sends a deal with a closing date, it lands here automatically.
            </p>
          </div>
        ) : (
          groups.map(([date, list]) => {
            const d = dayLabel(date);
            return (
              <section key={date} className="space-y-2.5">
                <h2 className="flex items-baseline gap-2">
                  <span className={`text-sm font-bold tracking-tight ${d.urgent ? "text-red-600" : ""}`}>
                    {d.text}
                  </span>
                  <span className="text-[11px] text-ink-muted">{d.note}</span>
                </h2>
                {list.map((r) => {
                  const g = gaps(r);
                  const hard = g.filter((x) => x.hard);
                  return (
                    <Link
                      key={r.id}
                      href={`/deal/${r.id}`}
                      className={`card card-hover p-4 block ${hard.length > 0 ? "border-red-200" : "border-emerald-200"}`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold">{r.client_name}</p>
                          <p className="text-xs text-ink-muted mt-0.5">
                            {r.partners?.name ?? "—"} ·{" "}
                            {statusLabel(r.status, r.partners?.partner_type)}
                          </p>
                          {/* A date that moved is the reason a file you thought
                              was fine is suddenly on this board. Say so. */}
                          {r.closing_date_changed_at && r.closing_date_was && (
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              moved from{" "}
                              {new Date(`${r.closing_date_was}T12:00:00`).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              by your partner
                            </p>
                          )}
                        </div>
                        <span className="shrink-0">
                          {hard.length === 0 ? (
                            <span className="badge bg-emerald-50 text-emerald-700">
                              <IconCheck size={11} /> Ready
                            </span>
                          ) : (
                            <StatusBadge status={r.status} partnerType={r.partners?.partner_type} />
                          )}
                        </span>
                      </div>
                      {g.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5 mt-2.5">
                          {g.map((x, i) => (
                            <li
                              key={i}
                              className={`badge ${
                                x.hard ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {x.hard && <IconAlert size={10} />} {x.label}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="link !text-[11px] mt-2.5">
                        Open the file <IconArrowRight size={11} />
                      </p>
                    </Link>
                  );
                })}
              </section>
            );
          })
        )}
      </main>
    </>
  );
}
