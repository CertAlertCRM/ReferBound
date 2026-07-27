"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STATUSES, STATUS_LABELS } from "@/lib/config";
import { StatusBadge, AtRiskBadge, StatusProgress, TopNav } from "./components";

type Referral = {
  id: string;
  client_name: string;
  client_phone: string | null;
  closing_date: string | null;
  status: string;
  source: string;
  created_at: string;
  partners: { name: string } | null;
  documents: { id: string; kind: string }[];
};

type Partner = { id: string; name: string };

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
    const [rRes, pRes] = await Promise.all([fetch("/api/referrals"), fetch("/api/partners")]);
    if (rRes.ok) setReferrals((await rRes.json()).referrals ?? []);
    if (pRes.ok) setPartners((await pRes.json()).partners ?? []);
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
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Summary strip */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-5 text-sm text-ink-secondary">
            <span><strong className="text-ink text-base">{inProgress}</strong> in progress</span>
            <span><strong className="text-ink text-base">{groups.risk.length}</strong> closing soon</span>
            <span><strong className="text-ink text-base">{groups.done.length}</strong> bound</span>
          </div>
          <button onClick={openAdd} className="btn-primary">+ Log lead</button>
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
                placeholder="Client phone"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
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
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        ) : referrals.length === 0 ? (
          <div className="card p-10 text-center space-y-2">
            <p className="font-semibold">No referrals yet</p>
            <p className="text-sm text-ink-secondary">
              Add your partners first, then log your first lead — it takes seconds.
            </p>
            <Link href="/partners" className="btn-ghost inline-flex mt-2">Set up partners →</Link>
          </div>
        ) : (
          <>
            <Section title="Closing soon — not bound" items={groups.risk} advance={advance} busyId={busyId} highlight />
            <Section title="Active" items={groups.active} advance={advance} busyId={busyId} />
            <Section title="Bound & delivered" items={groups.done} advance={advance} busyId={busyId} />
            <Section title="Not written" items={groups.lost} advance={advance} busyId={busyId} />
          </>
        )}
      </main>
    </>
  );
}

function Section({
  title,
  items,
  advance,
  busyId,
  highlight,
}: {
  title: string;
  items: Referral[];
  advance: (r: Referral) => void;
  busyId: string | null;
  highlight?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h2 className={`section-label ${highlight ? "!text-red-600" : ""}`}>
        {title} · {items.length}
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
                    {busyId === r.id ? "…" : `→ ${STATUS_LABELS[ns]}`}
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
