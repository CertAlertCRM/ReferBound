"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "../components";
import { PARTNER_TYPES } from "@/lib/config";
import { IconPencil, IconExternal, IconCopy, IconCheck, IconPlus, IconTrash } from "../icons";
import { PartnerInviteButton } from "../partner-invite";

type Partner = {
  id: string;
  name: string;
  token: string;
  emails: string[];
  logoUrl: string | null;
  partner_type: string;
  monthly_summary: boolean;
  short_code: string | null;
  referrals: { count: number }[];
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [ptype, setPtype] = useState("lender");
  const [editType, setEditType] = useState("lender");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editRecap, setEditRecap] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [qr, setQr] = useState<{ name: string; dataUrl: string; link: string } | null>(null);

  async function load() {
    const res = await fetch("/api/partners");
    if (res.ok) setPartners((await res.json()).partners ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emails, partner_type: ptype }),
    });
    setSaving(false);
    if (res.ok) {
      setName("");
      setEmails("");
      load();
    } else {
      const err = await res.json();
      if (err.upgrade) {
        if (confirm(`${err.error}\n\nOpen the billing page to upgrade?`)) {
          window.location.href = "/billing";
        }
      } else {
        alert(err.error ?? "Failed");
      }
    }
  }

  async function copy(p: Partner) {
    // Prefer the compact short link — same portal, way cleaner in a text.
    await navigator.clipboard.writeText(`${window.location.origin}/p/${p.short_code || p.token}`);
    setCopied(p.id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function showQr(p: Partner) {
    const link = `${window.location.origin}/p/${p.short_code || p.token}`;
    const QR = (await import("qrcode")).default;
    const url = await QR.toDataURL(link, {
      width: 640,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
    setQr({ name: p.name, dataUrl: url, link });
  }

  async function deletePartner(p: Partner) {
    const n = p.referrals?.[0]?.count ?? 0;
    const ok = confirm(
      `Delete ${p.name}? Their magic link stops working immediately and ${
        n === 0 ? "" : `their ${n} referral${n === 1 ? "" : "s"}, documents, and messages are `
      }permanently removed. This can't be undone.`
    );
    if (!ok) return;
    const res = await fetch(`/api/partners/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      setEditingId(null);
      load();
    } else alert((await res.json()).error ?? "Failed to delete");
  }

  async function uploadLogo(p: Partner, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/partners/${p.id}/logo`, { method: "POST", body: fd });
    e.target.value = "";
    if (res.ok) load();
    else alert((await res.json()).error ?? "Upload failed");
  }

  function startEdit(p: Partner) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditEmails(p.emails.join(", "));
    setEditType(p.partner_type ?? "lender");
    setEditRecap(p.monthly_summary !== false);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    const res = await fetch(`/api/partners/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, emails: editEmails, partner_type: editType, monthly_summary: editRecap }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditingId(null);
      load();
    } else alert((await res.json()).error ?? "Failed to save");
  }

  return (
    <>
      <TopNav active="partners" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Referral partners</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Each partner gets a private magic link — their live window into every referral they&apos;ve sent you.
          </p>
        </div>

        <form onSubmit={add} className="card p-5 space-y-3">
          <h2 className="section-label">Add a partner</h2>
          <input
            className="input"
            placeholder="Partner / team name (e.g., Cowart Home Loans)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="section-label">Partner type</span>
              <select className="input mt-1.5" value={ptype} onChange={(e) => setPtype(e.target.value)}>
                {Object.entries(PARTNER_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="section-label">Notification emails</span>
              <input
                className="input mt-1.5"
                placeholder="Comma-separated"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-ink-muted">
            The type shapes their portal: lenders get the closing-date + 1003 flow; everyone else gets
            a simple client-details form.
          </p>
          <button className="btn-primary" disabled={saving}>
            {saving ? "Adding…" : "Add partner"}
          </button>
        </form>

        <div className="space-y-3">
          {partners.map((p) => (
            <div key={p.id} className="card p-5">
              {editingId === p.id ? (
                <form onSubmit={saveEdit} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Edit {p.name}</h3>
                    <span className="badge bg-slate-100 text-slate-700">
                      {p.referrals?.[0]?.count ?? 0} referral{(p.referrals?.[0]?.count ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-start gap-4">
                    {/* Logo with replace-on-hover, right where you'd expect it */}
                    <label
                      className="relative w-20 h-20 rounded-xl cursor-pointer group/logo shrink-0"
                      title={p.logoUrl ? "Replace logo" : "Upload logo"}
                    >
                      {p.logoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.logoUrl}
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
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => uploadLogo(p, e)} />
                    </label>
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block sm:col-span-2">
                        <span className="section-label">Partner name</span>
                        <input
                          className="input mt-1.5"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                        />
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
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-brand"
                      checked={editRecap}
                      onChange={(e) => setEditRecap(e.target.checked)}
                    />
                    <span>
                      <span className="text-sm font-medium block">Send the monthly recap email</span>
                      <span className="text-xs text-ink-muted">
                        Their monthly referral summary. Turn off for partners who&apos;d rather just
                        have the live portal and great service — status and document emails still send.
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={editSaving}>
                      {editSaving ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">
                    The magic link stays the same — edits here don&apos;t break anything you&apos;ve already sent.
                  </p>
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs !text-red-600"
                      onClick={() => deletePartner(p)}
                    >
                      <IconTrash size={12} /> Delete partner…
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    {/* Logo box IS the upload/replace control — hover it */}
                    <label
                      className="relative w-16 h-16 rounded-lg cursor-pointer group/logo shrink-0"
                      title={p.logoUrl ? "Replace this partner's logo" : "Upload this partner's logo"}
                    >
                      {p.logoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.logoUrl}
                            alt=""
                            className="w-16 h-16 rounded-lg object-contain bg-white border border-slate-200 p-1.5"
                          />
                          <span className="absolute inset-0 rounded-lg bg-slate-900/60 text-white text-[11px] font-semibold flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                            Replace
                          </span>
                        </>
                      ) : (
                        <span className="w-16 h-16 rounded-lg border border-dashed border-slate-300 text-ink-muted flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold hover:border-brand hover:text-brand text-center leading-tight">
                          <IconPlus size={14} />
                          logo
                        </span>
                      )}
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => uploadLogo(p, e)} />
                    </label>
                    <Link href={`/partner/${p.id}`} className="block group/name min-w-0">
                      <p className="font-semibold group-hover/name:text-brand transition-colors">
                        {p.name}{" "}
                        <span className="badge bg-slate-100 text-slate-700 align-middle ml-1">
                          {PARTNER_TYPES[p.partner_type] ?? "Lender"}
                        </span>
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {p.referrals?.[0]?.count ?? 0} referral{(p.referrals?.[0]?.count ?? 0) === 1 ? "" : "s"}
                        {p.emails.length > 0 && <> · notifies {p.emails.join(", ")}</>}
                        <span className="text-brand font-medium"> · open workspace →</span>
                      </p>
                    </Link>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => startEdit(p)}>
                      <IconPencil size={12} /> Edit
                    </button>
                    <Link className="btn-ghost !px-3 !py-1.5 text-xs" href={`/p/${p.short_code || p.token}`}>
                      <IconExternal size={12} /> View portal
                    </Link>
                    <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => showQr(p)}>
                      ▦ QR
                    </button>
                    <PartnerInviteButton partnerId={p.id} partnerName={p.name} />
                    <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => copy(p)}>
                      {copied === p.id ? (
                        <>
                          <IconCheck size={12} /> Copied
                        </>
                      ) : (
                        <>
                          <IconCopy size={12} /> Copy magic link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* QR modal — scan-to-open magic link for coffee-meeting handoffs */}
          {qr && (
            <div
              className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-6"
              onClick={() => setQr(null)}
            >
              <div className="card p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
                <p className="font-semibold">{qr.name}</p>
                <p className="text-xs text-ink-muted mt-0.5">Scan to open their live portal</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.dataUrl} alt={`QR code for ${qr.name}'s portal`} className="w-full rounded-xl border border-slate-200 mt-3" />
                <p className="text-[11px] text-ink-muted mt-2 break-all">{qr.link}</p>
                <div className="flex gap-2 mt-4">
                  <a href={qr.dataUrl} download={`referbound-qr-${qr.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`} className="btn-primary flex-1 !py-2 text-xs">
                    Download PNG
                  </a>
                  <button className="btn-ghost flex-1 !py-2 text-xs" onClick={() => setQr(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {partners.length === 0 && (
            <div className="card p-10 text-center text-ink-muted text-sm">
              No partners yet — add your first one above, then send them their magic link.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
