"use client";

import { useEffect, useState } from "react";
import { TopNav } from "../components";
import { PARTNER_TYPES } from "@/lib/config";
import { IconPencil, IconExternal, IconCopy, IconCheck, IconPlus } from "../icons";

type Partner = {
  id: string;
  name: string;
  token: string;
  emails: string[];
  logoUrl: string | null;
  partner_type: string;
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
  const [editSaving, setEditSaving] = useState(false);

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
    await navigator.clipboard.writeText(`${window.location.origin}/p/${p.token}`);
    setCopied(p.id);
    setTimeout(() => setCopied(null), 1500);
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
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    const res = await fetch(`/api/partners/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, emails: editEmails, partner_type: editType }),
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
                <form onSubmit={saveEdit} className="space-y-3">
                  <label className="block">
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
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {p.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.logoUrl}
                        alt=""
                        className="w-16 h-16 rounded-lg object-contain bg-white border border-slate-200 p-1.5"
                      />
                    ) : (
                      <label
                        className="w-16 h-16 rounded-lg border border-dashed border-slate-300 text-ink-muted flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer hover:border-brand hover:text-brand text-center leading-tight"
                        title="Upload this partner's logo"
                      >
                        <IconPlus size={14} />
                        logo
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => uploadLogo(p, e)} />
                      </label>
                    )}
                    <div>
                      <p className="font-semibold">
                        {p.name}{" "}
                        <span className="badge bg-slate-100 text-slate-600 align-middle ml-1">
                          {PARTNER_TYPES[p.partner_type] ?? "Lender"}
                        </span>
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {p.referrals?.[0]?.count ?? 0} referral{(p.referrals?.[0]?.count ?? 0) === 1 ? "" : "s"}
                        {p.emails.length > 0 && <> · notifies {p.emails.join(", ")}</>}
                        {p.logoUrl && (
                          <>
                            {" · "}
                            <label className="text-brand cursor-pointer hover:text-brand-dark font-medium">
                              replace logo
                              <input type="file" className="hidden" accept="image/*" onChange={(e) => uploadLogo(p, e)} />
                            </label>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => startEdit(p)}>
                      <IconPencil size={12} /> Edit
                    </button>
                    <a className="btn-ghost !px-3 !py-1.5 text-xs" href={`/p/${p.token}`} target="_blank">
                      <IconExternal size={12} /> View portal
                    </a>
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
