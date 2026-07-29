"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TopNav, StatusBadge } from "../../components";
import { PARTNER_TYPES } from "@/lib/config";
import { formatPhoneInput } from "@/lib/format";
import {
  IconArrowLeft,
  IconCopy,
  IconCheck,
  IconExternal,
  IconPlus,
  IconTrash,
  IconPencil,
} from "../../icons";

// The partner workspace: one partner, all their leads, bulk actions, and a
// log-lead form already pointed at them. Reached by clicking a partner on the
// Partners page — everything stays in this tab.

type Partner = {
  id: string;
  name: string;
  token: string;
  short_code: string | null;
  emails: string[];
  logoUrl: string | null;
  partner_type: string;
  monthly_summary: boolean;
  referrals: { count: number }[];
};

type Referral = {
  id: string;
  client_name: string;
  client_phone: string | null;
  closing_date: string | null;
  status: string;
  premium: number | null;
  created_at: string;
  source: string;
  partner_id?: string;
  partners: { name: string } | null;
};

export default function PartnerWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editType, setEditType] = useState("lender");
  const [editRecap, setEditRecap] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client_name: "", client_phone: "", closing_date: "", notes: "" });

  async function load() {
    const [pRes, rRes] = await Promise.all([fetch("/api/partners"), fetch("/api/referrals")]);
    if (pRes.ok) {
      const all: Partner[] = (await pRes.json()).partners ?? [];
      const found = all.find((x) => x.id === id) ?? null;
      setPartner(found);
      if (!found) setMissing(true);
    }
    if (rRes.ok) {
      const all: (Referral & { partner_id: string })[] = (await rRes.json()).referrals ?? [];
      setRefs(all.filter((r) => r.partner_id === id));
    }
    setSelected(new Set());
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const portalPath = partner ? `/p/${partner.short_code || partner.token}` : "#";

  async function copyLink() {
    if (!partner) return;
    await navigator.clipboard.writeText(`${window.location.origin}${portalPath}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function showQr() {
    if (!partner) return;
    const QR = (await import("qrcode")).default;
    setQrUrl(
      await QR.toDataURL(`${window.location.origin}${portalPath}`, {
        width: 640,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      })
    );
  }

  function toggle(rid: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(rid)) n.delete(rid);
      else n.add(rid);
      return n;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    const ok = confirm(
      `Remove ${selected.size} lead${selected.size === 1 ? "" : "s"}? Their documents, messages, and history are permanently deleted. This can't be undone.`
    );
    if (!ok) return;
    setBulkBusy(true);
    for (const rid of Array.from(selected)) {
      await fetch(`/api/referrals/${rid}`, { method: "DELETE" });
    }
    setBulkBusy(false);
    load();
  }

  function startEdit() {
    if (!partner) return;
    setEditName(partner.name);
    setEditEmails(partner.emails.join(", "));
    setEditType(partner.partner_type ?? "lender");
    setEditRecap(partner.monthly_summary !== false);
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    const res = await fetch(`/api/partners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, emails: editEmails, partner_type: editType, monthly_summary: editRecap }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditing(false);
      load();
    } else alert((await res.json()).error ?? "Failed to save");
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/partners/${id}/logo`, { method: "POST", body: fd });
    e.target.value = "";
    if (res.ok) load();
    else alert((await res.json()).error ?? "Upload failed");
  }

  async function deletePartner() {
    if (!partner) return;
    const n = refs.length;
    const ok = confirm(
      `Delete ${partner.name}? Their magic link stops working immediately and ${
        n === 0 ? "" : `their ${n} lead${n === 1 ? "" : "s"}, documents, and messages are `
      }permanently removed. This can't be undone.`
    );
    if (!ok) return;
    const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/partners");
    else alert((await res.json()).error ?? "Failed to delete");
  }

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, partner_id: id }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ client_name: "", client_phone: "", closing_date: "", notes: "" });
      setShowAdd(false);
      load();
    } else {
      alert((await res.json()).error ?? "Failed to save");
    }
  }

  const stats = useMemo(() => {
    const bound = refs.filter((r) => ["bound", "docs_delivered"].includes(r.status));
    const premium = bound.reduce((a, r) => a + (r.premium ?? 0), 0);
    const active = refs.filter((r) => !["bound", "docs_delivered", "lost"].includes(r.status));
    return { total: refs.length, active: active.length, bound: bound.length, premium };
  }, [refs]);

  const sorted = useMemo(
    () => [...refs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [refs]
  );
  const allSelected = sorted.length > 0 && selected.size === sorted.length;

  if (missing) {
    return (
      <>
        <TopNav active="partners" />
        <main className="max-w-2xl mx-auto p-6 space-y-4">
          <div className="card p-10 text-center text-ink-muted">
            That partner doesn&apos;t exist (or was deleted).{" "}
            <Link href="/partners" className="link">
              Back to partners
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="partners" />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <Link href="/partners" className="link-back">
          <IconArrowLeft size={15} /> All partners
        </Link>

        {!partner ? (
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        ) : (
          <>
            {/* Partner header — edits happen right here, in place */}
            <header className="card p-5 sm:p-6">
              {editing ? (
                <form onSubmit={saveEdit} className="space-y-4">
                  <div className="flex items-start gap-4">
                    <label
                      className="relative w-20 h-20 rounded-xl cursor-pointer group/logo shrink-0"
                      title={partner.logoUrl ? "Replace logo" : "Upload logo"}
                    >
                      {partner.logoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={partner.logoUrl}
                            alt=""
                            className="w-20 h-20 rounded-xl object-contain bg-white border border-slate-200 p-2"
                          />
                          <span className="absolute inset-0 rounded-xl bg-slate-900/60 text-white text-[11px] font-semibold flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                            Replace
                          </span>
                        </>
                      ) : (
                        <span className="w-20 h-20 rounded-xl border border-dashed border-slate-300 text-ink-muted flex flex-col items-center justify-center gap-1 text-[11px] font-semibold hover:border-brand hover:text-brand">
                          <IconPlus size={16} />
                          Add logo
                        </span>
                      )}
                      <input type="file" className="hidden" accept="image/*" onChange={uploadLogo} />
                    </label>
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block sm:col-span-2">
                        <span className="section-label">Partner name</span>
                        <input className="input mt-1.5" value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus />
                      </label>
                      <label className="block">
                        <span className="section-label">Notification emails (comma-separated)</span>
                        <input
                          className="input mt-1.5"
                          value={editEmails}
                          onChange={(e) => setEditEmails(e.target.value)}
                          placeholder="lo@lender.com, processor@lender.com"
                        />
                      </label>
                      <label className="block">
                        <span className="section-label">Partner type</span>
                        <select className="input mt-1.5" value={editType} onChange={(e) => setEditType(e.target.value)}>
                          {Object.entries(PARTNER_TYPES).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 accent-brand" checked={editRecap} onChange={(e) => setEditRecap(e.target.checked)} />
                    <span>
                      <span className="text-sm font-medium block">Send the monthly recap email</span>
                      <span className="text-xs text-ink-muted">
                        Turn off for partners who&apos;d rather just have the live portal — status and
                        document emails still send.
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex gap-2">
                      <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={editSaving}>
                        {editSaving ? "Saving…" : "Save changes"}
                      </button>
                      <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                    </div>
                    <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs !text-red-600" onClick={deletePartner}>
                      <IconTrash size={12} /> Delete partner…
                    </button>
                  </div>
                </form>
              ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 min-w-0">
                  <label
                    className="relative w-16 h-16 rounded-xl cursor-pointer group/logo shrink-0"
                    title={partner.logoUrl ? "Replace logo" : "Upload logo"}
                  >
                    {partner.logoUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={partner.logoUrl}
                          alt=""
                          className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-200 p-1.5"
                        />
                        <span className="absolute inset-0 rounded-xl bg-slate-900/60 text-white text-[11px] font-semibold flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                          Replace
                        </span>
                      </>
                    ) : (
                      <span className="w-16 h-16 rounded-xl border border-dashed border-slate-300 text-ink-muted flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold hover:border-brand hover:text-brand">
                        <IconPlus size={14} />
                        logo
                      </span>
                    )}
                    <input type="file" className="hidden" accept="image/*" onChange={uploadLogo} />
                  </label>
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold tracking-tight truncate">
                      {partner.name}{" "}
                      <span className="badge bg-slate-100 text-slate-700 align-middle ml-1">
                        {PARTNER_TYPES[partner.partner_type] ?? "Lender"}
                      </span>
                    </h1>
                    {partner.emails.length > 0 && (
                      <p className="text-xs text-ink-muted mt-0.5 truncate">notifies {partner.emails.join(", ")}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={startEdit}>
                    <IconPencil size={12} /> Edit
                  </button>
                  <Link href={portalPath} className="btn-ghost !px-3 !py-1.5 text-xs">
                    <IconExternal size={12} /> View portal
                  </Link>
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={showQr}>
                    ▦ QR
                  </button>
                  <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={copyLink}>
                    {copied ? <IconCheck size={12} /> : <IconCopy size={12} />} {copied ? "Copied" : "Copy magic link"}
                  </button>
                </div>
              </div>
              )}
              <div className="grid grid-cols-4 gap-2.5 mt-4">
                {[
                  { v: String(stats.total), l: "Referred" },
                  { v: String(stats.active), l: "In progress" },
                  { v: String(stats.bound), l: "Bound" },
                  { v: stats.premium > 0 ? `$${Math.round(stats.premium).toLocaleString()}` : "$0", l: "Premium" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-center sm:text-left">
                    <p className="text-lg font-semibold tracking-tight">{s.v}</p>
                    <p className="text-[11px] text-ink-muted">{s.l}</p>
                  </div>
                ))}
              </div>
            </header>

            {/* Add lead for THIS partner */}
            {showAdd ? (
              <form onSubmit={addLead} className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">New lead from {partner.name}</h2>
                  <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setShowAdd(false)}>
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    className="input"
                    placeholder="Client name *"
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    required
                    autoFocus
                  />
                  <input
                    className="input"
                    type="tel"
                    placeholder="Client phone"
                    value={form.client_phone}
                    onChange={(e) => setForm({ ...form, client_phone: formatPhoneInput(e.target.value) })}
                  />
                  <label className="block">
                    <span className="text-xs text-ink-secondary">Closing date</span>
                    <input
                      className="input mt-1"
                      type="date"
                      value={form.closing_date}
                      onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-ink-secondary">Notes</span>
                    <input
                      className="input mt-1"
                      placeholder="Anything worth remembering"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </label>
                </div>
                <button className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Log lead"}
                </button>
              </form>
            ) : (
              <button className="btn-primary w-full !py-2.5" onClick={() => setShowAdd(true)}>
                <IconPlus size={15} /> Log a lead from {partner.name}
              </button>
            )}

            {/* Leads with bulk selection */}
            <section className="card overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-slate-100">
                <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-brand"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(sorted.map((r) => r.id)))
                    }
                  />
                  {selected.size > 0 ? `${selected.size} selected` : `Leads · ${sorted.length}`}
                </label>
                {selected.size > 0 && (
                  <button
                    className="btn-ghost !px-3 !py-1.5 text-xs !text-red-600"
                    onClick={bulkDelete}
                    disabled={bulkBusy}
                  >
                    <IconTrash size={12} /> {bulkBusy ? "Removing…" : `Remove ${selected.size}`}
                  </button>
                )}
              </div>
              {sorted.length === 0 ? (
                <p className="p-8 text-center text-sm text-ink-muted">
                  No leads yet — log one above, or send {partner.name} their magic link and let them
                  submit the first one.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {sorted.map((r) => (
                    <li key={r.id} className="px-5 py-3 flex items-center gap-3.5 hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        className="accent-brand shrink-0"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                      <Link href={`/deal/${r.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-3 group">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold group-hover:text-brand transition-colors truncate">
                            {r.client_name}
                          </p>
                          <p className="text-[11px] text-ink-muted">
                            {r.closing_date ? `closes ${r.closing_date}` : `added ${r.created_at.slice(0, 10)}`}
                            {r.source === "partner" && " · via portal"}
                            {typeof r.premium === "number" && r.premium > 0 && ` · $${Math.round(r.premium).toLocaleString()}`}
                          </p>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* QR modal */}
        {qrUrl && partner && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-6" onClick={() => setQrUrl(null)}>
            <div className="card p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
              <p className="font-semibold">{partner.name}</p>
              <p className="text-xs text-ink-muted mt-0.5">Scan to open their live portal</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR code" className="w-full rounded-xl border border-slate-200 mt-3" />
              <div className="flex gap-2 mt-4">
                <a href={qrUrl} download={`referbound-qr-${partner.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`} className="btn-primary flex-1 !py-2 text-xs">
                  Download PNG
                </a>
                <button className="btn-ghost flex-1 !py-2 text-xs" onClick={() => setQrUrl(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
