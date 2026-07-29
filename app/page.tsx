"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STATUSES, STATUS_LABELS } from "@/lib/config";
import { formatPhoneInput } from "@/lib/format";
import { StatusBadge, AtRiskBadge, StatusProgress, TopNav } from "./components";
import { IconPlus, IconArrowRight, IconChevronDown, IconChevronUp, IconDownload, IconCheck } from "./icons";

type Referral = {
  id: string;
  client_name: string;
  client_phone: string | null;
  closing_date: string | null;
  status: string;
  source: string;
  created_at: string;
  premium: number | null;
  client_dob: string | null;
  property_address: string | null;
  partners: { name: string } | null;
  documents: { id: string; kind: string }[];
};

type Partner = { id: string; name: string };

type ActivityItem = {
  id: number;
  referral_id: string;
  event_type: string;
  detail: string | null;
  actor: string;
  created_at: string;
  client_name: string | null;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function atRisk(r: Referral): boolean {
  const days = daysUntil(r.closing_date);
  return (
    days !== null &&
    days <= 7 &&
    days >= -1 &&
    !["bound", "docs_delivered", "lost"].includes(r.status)
  );
}

function nextStatus(status: string): string | null {
  const i = STATUSES.indexOf(status as any);
  if (i === -1 || i === STATUSES.length - 1) return null;
  return STATUSES[i + 1];
}

export default function Dashboard() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const formOpenedAt = useRef<number>(0);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    partner_id: "",
    closing_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [rRes, pRes, profRes, aRes] = await Promise.all([
      fetch("/api/referrals"),
      fetch("/api/partners"),
      fetch("/api/profile"),
      fetch("/api/activity"),
    ]);
    if (rRes.ok) setReferrals((await rRes.json()).referrals ?? []);
    if (pRes.ok) setPartners((await pRes.json()).partners ?? []);
    if (aRes.ok) setFeed((await aRes.json()).activity ?? []);
    if (profRes.ok) {
      const { profile, headshotUrl } = await profRes.json();
      setProfileName(profile?.display_name ?? null);
      setHeadshotUrl(headshotUrl ?? null);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    formOpenedAt.current = Date.now();
    setShowAdd(true);
  }

  async function saveLead(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const log_seconds = Math.round((Date.now() - formOpenedAt.current) / 100) / 10;
    const res = await fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, log_seconds }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ client_name: "", client_phone: "", partner_id: form.partner_id, closing_date: "", notes: "" });
      setShowAdd(false);
      load();
    } else {
      alert((await res.json()).error ?? "Failed to save");
    }
  }

  async function advance(r: Referral) {
    const ns = nextStatus(r.status);
    if (!ns) return;
    if (ns === "docs_delivered" && (r.documents?.length ?? 0) === 0) {
      const ok = confirm(
        "No documents are uploaded yet, but this sends the partner their one “bound + documents ready” email. Open the deal to upload the EOI/RCE first, or continue anyway?"
      );
      if (!ok) return;
    }
    setBusyId(r.id);
    await fetch(`/api/referrals/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: ns }),
    });
    setBusyId(null);
    load();
  }

  const groups = useMemo(() => {
    const risk = referrals.filter(atRisk);
    const active = referrals.filter(
      (r) => !atRisk(r) && !["bound", "docs_delivered", "lost"].includes(r.status)
    );
    const done = referrals.filter((r) => ["bound", "docs_delivered"].includes(r.status));
    const lost = referrals.filter((r) => r.status === "lost");
    return { risk, active, done, lost };
  }, [referrals]);

  const inProgress = groups.risk.length + groups.active.length;

  return (
    <>
      <TopNav active="referrals" />
      <main className="max-w-3xl xl:max-w-6xl mx-auto p-4 sm:p-6">
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6 xl:items-start">
        <div className="space-y-6 min-w-0">
        {/* Greeting */}
        {(profileName || headshotUrl) && (
          <div className="flex items-center gap-3">
            {headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headshotUrl}
                alt=""
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-card"
              />
            ) : null}
            <div>
              <p className="text-lg font-bold tracking-tight leading-tight">
                Welcome back{profileName ? `, ${profileName.split(" ")[0]}` : ""}
              </p>
              <p className="text-xs text-ink-muted">Here&apos;s where your referrals stand.</p>
            </div>
          </div>
        )}

        {/* Stat tiles */}
        <div className="flex items-start justify-between gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
            {[
              { v: String(inProgress), l: "In progress" },
              { v: String(groups.risk.length), l: "Closing soon", alert: groups.risk.length > 0 },
              { v: String(groups.done.length), l: "Bound" },
              {
                v: (() => {
                  const p = referrals
                    .filter((r) => ["bound", "docs_delivered"].includes(r.status))
                    .reduce((a, r) => a + (r.premium ?? 0), 0);
                  return p > 0 ? `$${Math.round(p).toLocaleString()}` : "$0";
                })(),
                l: "Premium sourced",
              },
            ].map((t) => (
              <div key={t.l} className={`card px-4 py-3 ${t.alert ? "border-red-200" : ""}`}>
                <p className={`text-xl font-semibold tracking-tight leading-6 ${t.alert ? "text-red-600" : ""}`}>
                  {t.v}
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5">{t.l}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-stretch gap-2 shrink-0">
            <button onClick={openAdd} className="btn-primary">
              <IconPlus size={15} /> Log lead
            </button>
            {referrals.length > 0 && (
              <a
                href="/api/export?scope=new"
                className="btn-ghost !py-1.5 text-xs justify-center"
                title="Downloads only leads that haven't been exported before — no re-keying duplicates into your CRM"
              >
                <IconDownload size={13} /> Export new
              </a>
            )}
          </div>
        </div>

        {showAdd && (
          <form onSubmit={saveLead} className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">New referral</h2>
              <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
            <input
              className="input"
              placeholder="Client name *"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              autoFocus
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                className="input"
                value={form.partner_id}
                onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                required
              >
                <option value="">Referred by… *</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="Client phone (804-555-1234)"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: formatPhoneInput(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="section-label">Closing date</span>
                <input
                  type="date"
                  className="input mt-1.5"
                  value={form.closing_date}
                  onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="section-label">Notes</span>
                <input
                  className="input mt-1.5"
                  placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <button className="btn-primary w-full" disabled={saving}>
              {saving ? "Saving…" : "Save lead"}
            </button>
            <p className="text-xs text-ink-muted text-center">Log time is measured automatically for the pilot.</p>
          </form>
        )}

        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-4 w-40 bg-slate-200 rounded" />
                <div className="h-3 w-64 bg-slate-100 rounded mt-2.5" />
                <div className="h-1.5 w-full bg-slate-100 rounded mt-3.5" />
              </div>
            ))}
          </div>
        ) : referrals.length === 0 ? (
          <GettingStarted profileDone={Boolean(profileName)} partnerDone={partners.length > 0} />
        ) : (
          <>
            <Section title="Closing soon — not bound" items={groups.risk} advance={advance} busyId={busyId} highlight />
            <Section title="Active" items={groups.active} advance={advance} busyId={busyId} />
            <Section title="Bound & delivered" items={groups.done} advance={advance} busyId={busyId} collapsible />
            <Section title="Not written" items={groups.lost} advance={advance} busyId={busyId} collapsible />
          </>
        )}
        </div>

        {/* Desktop rail — the margins earn their keep on wide screens */}
        <aside className="hidden xl:block space-y-4 sticky top-6">
          {groups.risk.length > 0 && (
            <div className="card p-4 border-red-200">
              <h3 className="section-label text-red-600 mb-2.5">Needs attention</h3>
              <ul className="space-y-2">
                {groups.risk.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link href={`/deal/${r.id}`} className="block group">
                      <p className="text-sm font-semibold group-hover:text-brand transition-colors">
                        {r.client_name}
                      </p>
                      <p className="text-[11px] text-red-600">
                        closes {r.closing_date} · {STATUS_LABELS[r.status] ?? r.status}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4">
            <h3 className="section-label mb-2.5">Latest activity</h3>
            {feed.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Everything that happens — leads, status moves, emails, messages — shows up here.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {feed.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex gap-2.5">
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        a.actor === "partner"
                          ? "bg-brand"
                          : a.actor === "system"
                            ? "bg-amber-400"
                            : "bg-slate-300"
                      }`}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/deal/${a.referral_id}`}
                        className="text-xs text-ink-secondary hover:text-ink transition-colors line-clamp-2 block"
                      >
                        {a.detail ?? a.event_type}
                      </Link>
                      <p className="text-[10px] text-ink-muted mt-0.5">{timeAgo(a.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <h3 className="section-label mb-2.5">Quick actions</h3>
            <div className="space-y-1.5">
              <Link href="/partners" className="link !text-xs block">
                Add or manage partners →
              </Link>
              <Link href="/stats" className="link !text-xs block">
                Partner ROI &amp; trends →
              </Link>
              <a
                href="/api/export?scope=new"
                className="link !text-xs block"
                title="Only leads not previously exported"
              >
                Export new leads (CSV) →
              </a>
              <a href="/api/export?scope=all" className="link !text-xs block">
                Export everything (CSV) →
              </a>
            </div>
          </div>
        </aside>
        </div>
      </main>
    </>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function GettingStarted({ profileDone, partnerDone }: { profileDone: boolean; partnerDone: boolean }) {
  const steps = [
    {
      done: profileDone,
      title: "Fill in your profile",
      body: "Your name, agency, and headshot appear on every partner portal — it's how partners see you.",
      href: "/profile",
      cta: "Open profile",
    },
    {
      done: partnerDone,
      title: "Add your best referral partner",
      body: "Start with the lender or realtor who sends you the most business. Takes thirty seconds.",
      href: "/partners",
      cta: "Add a partner",
    },
    {
      done: false,
      title: "Send them their magic link",
      body: "Copy the link from the Partners page and text or email it over. No login on their end — they'll see every referral live, and they can submit new ones straight to you.",
      href: "/partners",
      cta: "Copy magic link",
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <div className="card p-6 sm:p-8">
      <h2 className="font-bold tracking-tight">Let&apos;s get your first partner live</h2>
      <p className="text-sm text-ink-secondary mt-1">
        Three steps, about five minutes — then every lead they send lands here on its own.
      </p>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3.5">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                s.done
                  ? "bg-emerald-50 text-emerald-600"
                  : i === next
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-ink-muted"
              }`}
            >
              {s.done ? <IconCheck size={14} /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${s.done ? "text-ink-muted line-through" : ""}`}>{s.title}</p>
              {!s.done && <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">{s.body}</p>}
              {!s.done && i === next && (
                <Link href={s.href} className="btn-primary !py-1.5 text-xs inline-flex mt-2">
                  {s.cta} <IconArrowRight size={12} />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-muted mt-5">
        Prefer to start solo? You can also{" "}
        <button type="button" className="link !text-xs" onClick={() => window.scrollTo({ top: 0 })}>
          log a lead yourself
        </button>{" "}
        with the button above.
      </p>
    </div>
  );
}

function Section({
  title,
  items,
  advance,
  busyId,
  highlight,
  collapsible,
}: {
  title: string;
  items: Referral[];
  advance: (r: Referral) => void;
  busyId: string | null;
  highlight?: boolean;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  if (items.length === 0) return null;
  if (collapsible && !open) {
    return (
      <section>
        <button
          onClick={() => setOpen(true)}
          className="w-full card px-4 py-3 flex items-center justify-between text-left hover:shadow-lift transition-shadow"
        >
          <span className="section-label">
            {title} · {items.length}
          </span>
          <span className="link">
            Show <IconChevronDown size={13} />
          </span>
        </button>
      </section>
    );
  }
  return (
    <section className="space-y-2.5">
      <h2 className={`section-label ${highlight ? "!text-red-600" : ""} flex items-center justify-between`}>
        <span>
          {title} · {items.length}
        </span>
        {collapsible && (
          <button onClick={() => setOpen(false)} className="link normal-case tracking-normal">
            Hide <IconChevronUp size={13} />
          </button>
        )}
      </h2>
      <div className="space-y-2.5">
        {items.map((r) => {
          const ns = nextStatus(r.status);
          const days = daysUntil(r.closing_date);
          return (
            <div
              key={r.id}
              className={`card p-4 hover:shadow-lift transition-shadow ${highlight ? "border-red-200" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/deal/${r.id}`} className="font-semibold hover:text-brand truncate">
                      {r.client_name}
                    </Link>
                    <StatusBadge status={r.status} />
                    {atRisk(r) && <AtRiskBadge />}
                    {r.source === "partner" && (
                      <span className="badge bg-brand-light text-brand-700">via portal</span>
                    )}
                    {!["bound", "docs_delivered", "lost"].includes(r.status) &&
                      (!r.client_dob || !r.property_address) && (
                        <span className="badge bg-amber-50 text-amber-700" title="Missing DOB or property address — open the deal to request or extract it">
                          missing info
                        </span>
                      )}
                  </div>
                  <p className="text-xs text-ink-muted mt-1">
                    {r.partners?.name ?? "—"}
                    {r.closing_date && (
                      <> · closes {r.closing_date}{days !== null && days >= 0 ? ` (${days}d)` : ""}</>
                    )}
                    {r.documents?.length > 0 && <> · {r.documents.length} doc{r.documents.length > 1 ? "s" : ""}</>}
                  </p>
                </div>
                {ns && r.status !== "lost" && (
                  <button
                    onClick={() => advance(r)}
                    disabled={busyId === r.id}
                    className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
                    title={`Advance to ${STATUS_LABELS[ns]}`}
                  >
                    {busyId === r.id ? "…" : (
                      <>
                        {STATUS_LABELS[ns]} <IconArrowRight size={12} />
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="mt-3">
                <StatusProgress status={r.status} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
