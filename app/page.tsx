"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STATUSES, STATUS_LABELS } from "@/lib/config";
import { StatusBadge, AtRiskBadge } from "./components";

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

  // quick-add form state + log-time capture
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

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Referrals</h1>
        <nav className="flex gap-2">
          <Link href="/partners" className="btn-ghost">Partners</Link>
          <Link href="/stats" className="btn-ghost">Stats</Link>
          <button onClick={openAdd} className="btn-primary">+ Log lead</button>
        </nav>
      </header>

      {showAdd && (
        <form onSubmit={saveLead} className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">New referral</h2>
            <button type="button" className="text-sm text-slate-500" onClick={() => setShowAdd(false)}>
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
            <label className="text-sm text-slate-600">
              Closing date
              <input
                type="date"
                className="input mt-1"
                value={form.closing_date}
                onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
              />
            </label>
            <label className="text-sm text-slate-600">
              Notes
              <input
                className="input mt-1"
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          <button className="btn-primary w-full" disabled={saving}>
            {saving ? "Saving…" : "Save lead"}
          </button>
          <p className="text-xs text-slate-400">Log time is measured automatically for the pilot.</p>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : referrals.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No referrals yet. Add your partners, then log your first lead.
        </div>
      ) : (
        <>
          <Section title="⚠ Closing soon — not bound" items={groups.risk} advance={advance} busyId={busyId} highlight />
          <Section title="Active" items={groups.active} advance={advance} busyId={busyId} />
          <Section title="Bound & delivered" items={groups.done} advance={advance} busyId={busyId} />
          <Section title="Not written" items={groups.lost} advance={advance} busyId={busyId} />
        </>
      )}
    </main>
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
    <section className="space-y-2">
      <h2 className={`text-sm font-semibold uppercase tracking-wide ${highlight ? "text-red-600" : "text-slate-500"}`}>
        {title} ({items.length})
      </h2>
      <div className="space-y-2">
        {items.map((r) => {
          const ns = nextStatus(r.status);
          const days = daysUntil(r.closing_date);
          return (
            <div key={r.id} className={`card p-4 flex items-center gap-3 ${highlight ? "border-red-200" : ""}`}>
              <div className="flex-1 min-w-0">
                <Link href={`/deal/${r.id}`} className="font-semibold hover:text-brand truncate block">
                  {r.client_name}
                </Link>
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-1 mt-1 items-center">
                  <span>{r.partners?.name ?? "—"}</span>
                  {r.closing_date && (
                    <span>
                      · closes {r.closing_date}
                      {days !== null && days >= 0 && ` (${days}d)`}
                    </span>
                  )}
                  {r.source === "partner" && <span className="badge bg-purple-100 text-purple-700">from partner</span>}
                  {r.documents?.length > 0 && <span>· {r.documents.length} doc(s)</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {atRisk(r) && <AtRiskBadge />}
                </div>
              </div>
              {ns && r.status !== "lost" && (
                <button
                  onClick={() => advance(r)}
                  disabled={busyId === r.id}
                  className="btn-ghost shrink-0 text-xs"
                  title={`Advance to ${STATUS_LABELS[ns]}`}
                >
                  {busyId === r.id ? "…" : `→ ${STATUS_LABELS[ns]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
