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
  IconX,
  IconMessage,
} from "../../icons";
import { PartnerInviteButton } from "../../partner-invite";
import { LeadPrefillBox } from "../../lead-prefill";
import { prepareLogo, sharpnessNote } from "@/lib/image";

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
  type_label: string | null;
  monthly_summary: boolean;
  thankyou_cadence: string;
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
  const [editTypeLabel, setEditTypeLabel] = useState("");
  const [txOpen, setTxOpen] = useState(false);
  // Lender requirements — collapsed by default so the edit panel stays calm.
  const [reqOpen, setReqOpen] = useState(false);
  const [req, setReq] = useState({
    mortgagee_clause: "",
    max_wind_deductible: "",
    min_liability: "",
    flood_required: false,
    notes: "",
  });
  const [editRecap, setEditRecap] = useState(true);
  const [editCadence, setEditCadence] = useState("off");
  const [editSaving, setEditSaving] = useState(false);
  const [contacts, setContacts] = useState<
    {
      id: string;
      name: string;
      email: string;
      role: string | null;
      phone?: string | null;
      sms_opt_in?: boolean;
      notify_channel?: string;
    }[]
  >([]);
  // Inline contact editor (add a mobile later, SMS consent, channel choice)
  const [ecId, setEcId] = useState<string | null>(null);
  const [ecPhone, setEcPhone] = useState("");
  const [ecSms, setEcSms] = useState(false);
  const [ecChannel, setEcChannel] = useState("both");
  const [ecBusy, setEcBusy] = useState(false);
  const [textBusy, setTextBusy] = useState<string | null>(null);
  const [textSent, setTextSent] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cSms, setCSms] = useState(false);
  const [cBusy, setCBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    client_name: "",
    coborrower_name: "",
    client_phone: "",
    client_email: "",
    client_dob: "",
    property_address: "",
    closing_date: "",
    notes: "",
  });

  async function load() {
    const [pRes, rRes, cRes] = await Promise.all([
      fetch("/api/partners"),
      fetch("/api/referrals"),
      fetch(`/api/partners/${id}/contacts`),
    ]);
    if (cRes.ok) setContacts((await cRes.json()).contacts ?? []);
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

  async function deleteOne(r: Referral) {
    const ok = confirm(
      `Delete ${r.client_name}? Documents, messages, and history for this lead are permanently removed. This can't be undone.`
    );
    if (!ok) return;
    const res = await fetch(`/api/referrals/${r.id}`, { method: "DELETE" });
    if (res.ok) load();
    else alert((await res.json()).error ?? "Failed to delete");
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
    setEditTypeLabel(partner.type_label ?? "");
    const rq = (partner as any).requirements ?? {};
    setReq({
      mortgagee_clause: rq.mortgagee_clause ?? "",
      max_wind_deductible: rq.max_wind_deductible ?? "",
      min_liability: rq.min_liability ?? "",
      flood_required: Boolean(rq.flood_required),
      notes: rq.notes ?? "",
    });
    setReqOpen(false);
    setEditRecap(partner.monthly_summary !== false);
    setEditCadence(partner.thankyou_cadence ?? "off");
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    const res = await fetch(`/api/partners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, emails: editEmails, partner_type: editType, type_label: editTypeLabel, monthly_summary: editRecap, thankyou_cadence: editCadence, requirements: req }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditing(false);
      load();
    } else alert((await res.json()).error ?? "Failed to save");
  }

  const [logoNote, setLogoNote] = useState("");

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLogoNote("");
    const prepared = await prepareLogo(file);
    const fd = new FormData();
    fd.append("file", prepared.file);
    const res = await fetch(`/api/partners/${id}/logo`, { method: "POST", body: fd });
    if (res.ok) {
      load();
      const note = sharpnessNote(prepared);
      if (note) setLogoNote(note);
    } else alert((await res.json()).error ?? "Upload failed");
  }

  async function addContact() {
    if (!cName.trim() || !cEmail.trim()) return;
    setCBusy(true);
    const res = await fetch(`/api/partners/${id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cName, email: cEmail, role: cRole, phone: cPhone, sms_opt_in: cSms }),
    });
    setCBusy(false);
    if (res.ok) {
      setCName("");
      setCEmail("");
      setCRole("");
      setCPhone("");
      setCSms(false);
      const { contact } = await res.json();
      setContacts((c) => [...c, contact]);
    } else alert((await res.json()).error ?? "Couldn't add contact");
  }

  function openContactEdit(c: (typeof contacts)[number]) {
    setEcId(c.id);
    setEcPhone(c.phone ?? "");
    setEcSms(Boolean(c.sms_opt_in));
    setEcChannel(c.notify_channel ?? "both");
  }

  async function saveContactEdit() {
    if (!ecId) return;
    setEcBusy(true);
    const res = await fetch(`/api/partners/${id}/contacts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: ecId, phone: ecPhone, sms_opt_in: ecSms, notify_channel: ecChannel }),
    });
    setEcBusy(false);
    if (res.ok) {
      const { contact } = await res.json();
      setContacts((cs) => cs.map((x) => (x.id === contact.id ? contact : x)));
      setEcId(null);
    } else alert((await res.json()).error ?? "Couldn't save");
  }

  async function textPortalLink(cid: string) {
    setTextBusy(cid);
    const res = await fetch(`/api/partners/${id}/text-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: cid }),
    });
    setTextBusy(null);
    if (res.ok) {
      setTextSent(cid);
      setTimeout(() => setTextSent(null), 2500);
    } else alert((await res.json()).error ?? "Couldn't send the text");
  }

  // One-off: text the link to a number the agent types in (no saved contact).
  async function textLinkToNumber() {
    const num = prompt("Mobile number to text the portal link to:");
    if (!num) return;
    setTextBusy("adhoc");
    const res = await fetch(`/api/partners/${id}/text-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: num }),
    });
    setTextBusy(null);
    if (res.ok) {
      setTextSent("adhoc");
      setTimeout(() => setTextSent(null), 2500);
    } else alert((await res.json()).error ?? "Couldn't send the text");
  }

  async function removeContact(cid: string) {
    const res = await fetch(`/api/partners/${id}/contacts?cid=${encodeURIComponent(cid)}`, { method: "DELETE" });
    if (res.ok) setContacts((c) => c.filter((x) => x.id !== cid));
  }

  async function rotateLink() {
    if (!partner) return;
    const ok = confirm(
      `Rotate ${partner.name}'s magic link? Every link and QR code you've already shared stops working immediately — you'll need to send the new one. Use this if the link got out beyond the team.`
    );
    if (!ok) return;
    const res = await fetch(`/api/partners/${id}/rotate`, { method: "POST" });
    if (res.ok) {
      const { short_code } = await res.json();
      await navigator.clipboard.writeText(`${window.location.origin}/p/${short_code}`).catch(() => {});
      alert("Link rotated — the new link is on your clipboard. Old links are dead.");
      load();
    } else alert((await res.json()).error ?? "Couldn't rotate the link");
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
    if (!res.ok) {
      setSaving(false);
      alert((await res.json()).error ?? "Failed to save");
      return;
    }
    const { referral } = await res.json();
    // Attach the prefill source doc to the new lead automatically.
    if (pendingFile && referral?.id) {
      const fd = new FormData();
      fd.append("file", pendingFile);
      fd.append("kind", "loan_1003");
      await fetch(`/api/referrals/${referral.id}/docs`, { method: "POST", body: fd }).catch(() => {});
    }
    setSaving(false);
    setForm({
      client_name: "",
      coborrower_name: "",
      client_phone: "",
      client_email: "",
      client_dob: "",
      property_address: "",
      closing_date: "",
      notes: "",
    });
    setPendingFile(null);
    setShowAdd(false);
    load();
  }

  const stats = useMemo(() => {
    const bound = refs.filter((r) => ["bound", "docs_delivered"].includes(r.status));
    // Counts reflect the whole relationship; premium splits live from imported
    // so the ROI figure is never inflated by history you loaded in.
    const premium = bound.filter((r) => !(r as any).backfilled).reduce((a, r) => a + (r.premium ?? 0), 0);
    const historyPremium = bound.filter((r) => (r as any).backfilled).reduce((a, r) => a + (r.premium ?? 0), 0);
    const active = refs.filter((r) => !["bound", "docs_delivered", "lost"].includes(r.status));
    return { total: refs.length, active: active.length, bound: bound.length, premium, historyPremium };
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
            {logoNote && (
              <div className="card px-4 py-2.5 border-amber-300 bg-amber-100">
                <p className="text-xs text-ink">{logoNote}</p>
              </div>
            )}

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
                      <input
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={uploadLogo}
                    />
                    </label>
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block sm:col-span-2">
                        <span className="section-label">Partner name</span>
                        <input className="input mt-1.5" value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus />
                      </label>
                      <label className="block">
                        <span className="section-label">Notification emails</span>
                        <input
                          className="input mt-1.5"
                          value={editEmails}
                          onChange={(e) => setEditEmails(e.target.value)}
                          placeholder="Comma-separated: lo@lender.com, processor@…"
                        />
                      </label>
                      <label className="block">
                        <span className="section-label">Partner type</span>
                        <select className="input mt-1.5" value={editType} onChange={(e) => setEditType(e.target.value)}>
                          {Object.entries(PARTNER_TYPES).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        {editType === "other" && (
                          <input
                            className="input mt-1.5"
                            placeholder="Call it anything — e.g., Networking group"
                            maxLength={40}
                            value={editTypeLabel}
                            onChange={(e) => setEditTypeLabel(e.target.value)}
                          />
                        )}
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <label className="block">
                      <span className="text-sm font-medium block">Thank-you notes</span>
                      <span className="text-xs text-ink-muted block">
                        Short, metric-free appreciation from you, sent on the 1st.
                      </span>
                      <select className="input mt-1.5 !py-2 text-sm" value={editCadence} onChange={(e) => setEditCadence(e.target.value)}>
                        <option value="off">Off</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                    </label>
                  </div>
                  {/* What this lender requires — collapsed; fills itself into
                      every future pre-delivery check once entered. */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                      onClick={() => setReqOpen(!reqOpen)}
                    >
                      <span>
                        <span className="text-sm font-semibold">Their requirements</span>
                        {(req.mortgagee_clause || req.max_wind_deductible || req.min_liability || req.flood_required) && (
                          <span className="badge bg-emerald-50 text-emerald-700 ml-2">on file</span>
                        )}
                        <span className="text-xs text-ink-muted block">
                          Optional. Enter once — every EOI you send them gets checked against it.
                        </span>
                      </span>
                      <span className="link !text-xs shrink-0">{reqOpen ? "Hide" : "Open"}</span>
                    </button>
                    {reqOpen && (
                      <div className="px-4 pb-4 space-y-2">
                        <label className="block">
                          <span className="text-xs text-ink-secondary">
                            Exact mortgagee clause (paste it exactly as they give it)
                          </span>
                          <textarea
                            className="input mt-1 !h-16 text-sm resize-y"
                            placeholder={"Cowart Home Loans ISAOA/ATIMA\nPO Box 12, Richmond VA 23220"}
                            value={req.mortgagee_clause}
                            onChange={(e) => setReq({ ...req, mortgagee_clause: e.target.value })}
                          />
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            className="input !py-2 text-sm"
                            placeholder="Max wind/hail deductible (e.g. 2%)"
                            value={req.max_wind_deductible}
                            onChange={(e) => setReq({ ...req, max_wind_deductible: e.target.value })}
                          />
                          <input
                            className="input !py-2 text-sm"
                            placeholder="Min liability (e.g. $300k)"
                            value={req.min_liability}
                            onChange={(e) => setReq({ ...req, min_liability: e.target.value })}
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-secondary">
                          <input
                            type="checkbox"
                            className="accent-brand"
                            checked={req.flood_required}
                            onChange={(e) => setReq({ ...req, flood_required: e.target.checked })}
                          />
                          Requires flood coverage when the property is in a flood zone
                        </label>
                        <input
                          className="input !py-2 text-sm"
                          placeholder="Anything else they always ask for"
                          value={req.notes}
                          onChange={(e) => setReq({ ...req, notes: e.target.value })}
                        />
                      </div>
                    )}
                  </div>

                  {/* Team contacts — who's who at this partner */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                    <p className="text-sm font-semibold">Team contacts</p>
                    <p className="text-xs text-ink-muted -mt-1">
                      Updates about a lead go to whoever sent it (they pick themselves when
                      submitting, or you can assign here later). No contact on a lead = the
                      notification emails above.
                    </p>
                    {contacts.length > 0 && (
                      <ul className="space-y-1.5">
                        {contacts.map((c) => (
                          <li key={c.id} className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{c.name}</span>
                                {c.role && <span className="text-ink-muted"> · {c.role}</span>}
                                <span className="text-xs text-ink-muted"> · {c.email}</span>
                                {c.phone && <span className="text-xs text-ink-muted"> · 📱 {c.phone}</span>}
                                {c.phone && c.sms_opt_in && (
                                  <span className="badge bg-emerald-50 text-emerald-700 ml-1.5 !text-[10px]">
                                    {c.notify_channel === "sms" ? "text only" : c.notify_channel === "email" ? "email only" : "email + text"}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                {c.phone && (
                                  <button
                                    type="button"
                                    className="link !text-[11px]"
                                    onClick={() => textPortalLink(c.id)}
                                    disabled={textBusy === c.id}
                                    title={`Text ${c.name} the portal link`}
                                  >
                                    <IconMessage size={12} />{" "}
                                    {textSent === c.id ? "Sent ✓" : textBusy === c.id ? "Sending…" : "Text link"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-ink-muted hover:text-brand shrink-0"
                                  onClick={() => (ecId === c.id ? setEcId(null) : openContactEdit(c))}
                                  title="Edit mobile & notifications"
                                >
                                  <IconPencil size={13} />
                                </button>
                                <button type="button" className="text-ink-muted hover:text-red-600 shrink-0" onClick={() => removeContact(c.id)} title="Remove contact">
                                  <IconX size={13} />
                                </button>
                              </span>
                            </div>
                            {ecId === c.id && (
                              <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    className="input !py-2 text-sm"
                                    type="tel"
                                    placeholder="Mobile"
                                    value={ecPhone}
                                    onChange={(e) => setEcPhone(formatPhoneInput(e.target.value))}
                                  />
                                  <select
                                    className="input !py-2 text-sm"
                                    value={ecChannel}
                                    onChange={(e) => setEcChannel(e.target.value)}
                                    title="How this contact hears about their leads at quote & docs-ready"
                                  >
                                    <option value="both">Notify by email + text</option>
                                    <option value="email">Notify by email only</option>
                                    <option value="sms">Notify by text only</option>
                                  </select>
                                </div>
                                {ecPhone && (
                                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-secondary">
                                    <input type="checkbox" className="accent-brand" checked={ecSms} onChange={(e) => setEcSms(e.target.checked)} />
                                    They&apos;re OK receiving texts (msg &amp; data rates may apply; reply STOP anytime)
                                  </label>
                                )}
                                {ecChannel === "sms" && (!ecPhone || !ecSms) && (
                                  <p className="text-[11px] text-amber-700">
                                    Text-only needs a mobile + their OK — until then, updates fall back to email.
                                  </p>
                                )}
                                <div className="flex gap-2">
                                  <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={saveContactEdit} disabled={ecBusy}>
                                    {ecBusy ? "Saving…" : "Save"}
                                  </button>
                                  <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setEcId(null)}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input className="input !py-2 text-sm" placeholder="Name" value={cName} onChange={(e) => setCName(e.target.value)} />
                      <input className="input !py-2 text-sm" type="email" placeholder="Email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                      <input className="input !py-2 text-sm" placeholder="Role (LO, processor…)" value={cRole} onChange={(e) => setCRole(e.target.value)} />
                      <input className="input !py-2 text-sm" type="tel" placeholder="Mobile (optional)" value={cPhone} onChange={(e) => setCPhone(formatPhoneInput(e.target.value))} />
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {cPhone ? (
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-secondary">
                          <input type="checkbox" className="accent-brand" checked={cSms} onChange={(e) => setCSms(e.target.checked)} />
                          Text them at quote &amp; docs-ready (only with their OK)
                        </label>
                      ) : (
                        <span />
                      )}
                      <button type="button" className="btn-ghost !py-2 text-xs" onClick={addContact} disabled={cBusy}>
                        {cBusy ? "…" : "Add contact"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex gap-2">
                      <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={editSaving}>
                        {editSaving ? "Saving…" : "Save changes"}
                      </button>
                      <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={rotateLink}>
                        ↻ Rotate magic link…
                      </button>
                      <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs !text-red-600" onClick={deletePartner}>
                        <IconTrash size={12} /> Delete partner…
                      </button>
                    </div>
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
                    <input
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={uploadLogo}
                    />
                  </label>
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold tracking-tight truncate">
                      {partner.name}{" "}
                      <span className="badge bg-slate-100 text-slate-700 align-middle ml-1">
                        {partner.type_label || (PARTNER_TYPES[partner.partner_type] ?? "Lender")}
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
                  {/* Text the magic link — front and center, not buried in edit mode */}
                  <div className="relative">
                    <button
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => setTxOpen(!txOpen)}
                      disabled={textBusy !== null}
                    >
                      <IconMessage size={12} />{" "}
                      {textSent ? "Sent ✓" : textBusy ? "Sending…" : "Text link"}
                    </button>
                    {txOpen && (
                      <div className="absolute right-0 top-full mt-1.5 z-30 card p-2 w-60 space-y-0.5 shadow-lift">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted px-2 pt-1 pb-1.5">
                          Text the portal link to…
                        </p>
                        {contacts.filter((c) => c.phone).map((c) => (
                          <button
                            key={c.id}
                            className="w-full text-left text-xs px-2 py-2 rounded-lg hover:bg-brand-light/60 transition-colors"
                            onClick={() => {
                              setTxOpen(false);
                              textPortalLink(c.id);
                            }}
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-ink-muted"> · {c.phone}</span>
                          </button>
                        ))}
                        {contacts.filter((c) => c.phone).length === 0 && (
                          <p className="text-[11px] text-ink-muted px-2 py-1.5">
                            No contacts with a mobile yet — add one in Edit, or:
                          </p>
                        )}
                        <button
                          className="w-full text-left text-xs px-2 py-2 rounded-lg hover:bg-brand-light/60 text-brand font-semibold transition-colors"
                          onClick={() => {
                            setTxOpen(false);
                            textLinkToNumber();
                          }}
                        >
                          Enter a number…
                        </button>
                      </div>
                    )}
                  </div>
                  <PartnerInviteButton partnerId={partner.id} partnerName={partner.name} />
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
                  {
                    v: stats.premium > 0 ? `$${Math.round(stats.premium).toLocaleString()}` : "$0",
                    l: "Premium",
                    hint:
                      stats.historyPremium > 0
                        ? `+$${Math.round(stats.historyPremium).toLocaleString()} imported`
                        : undefined,
                  },
                ].map((s: any) => (
                  <div key={s.l} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-center sm:text-left">
                    <p className="text-lg font-semibold tracking-tight">{s.v}</p>
                    <p className="text-[11px] text-ink-muted">{s.l}</p>
                    {s.hint && <p className="text-[10px] text-ink-muted">{s.hint}</p>}
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
                <LeadPrefillBox
                  onFile={setPendingFile}
                  onFields={(f) =>
                    setForm((prev) => {
                      const next = { ...prev };
                      for (const k of Object.keys(next) as (keyof typeof next)[]) {
                        if (f[k] && !next[k]) next[k] = k === "client_phone" ? formatPhoneInput(f[k]) : f[k];
                      }
                      return next;
                    })
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    className="input"
                    placeholder="Client name *"
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    required
                  />
                  <input
                    className="input"
                    placeholder="Co-borrower (optional)"
                    value={form.coborrower_name}
                    onChange={(e) => setForm({ ...form, coborrower_name: e.target.value })}
                  />
                  <input
                    className="input"
                    type="tel"
                    placeholder="Client phone"
                    value={form.client_phone}
                    onChange={(e) => setForm({ ...form, client_phone: formatPhoneInput(e.target.value) })}
                  />
                  <input
                    className="input"
                    type="email"
                    placeholder="Client email"
                    value={form.client_email}
                    onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                  />
                  <label className="block">
                    <span className="text-xs text-ink-secondary">Date of birth</span>
                    <input
                      className="input mt-1"
                      type="date"
                      value={form.client_dob}
                      onChange={(e) => setForm({ ...form, client_dob: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-ink-secondary">Closing date</span>
                    <input
                      className="input mt-1"
                      type="date"
                      value={form.closing_date}
                      onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
                    />
                  </label>
                  <input
                    className="input sm:col-span-2"
                    placeholder="Property address (street, city, state, zip)"
                    value={form.property_address}
                    onChange={(e) => setForm({ ...form, property_address: e.target.value })}
                  />
                  <input
                    className="input sm:col-span-2"
                    placeholder="Notes — anything worth remembering"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
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
                      <button
                        type="button"
                        className="text-ink-muted hover:text-red-600 transition-colors shrink-0 p-1"
                        title={`Delete ${r.client_name}`}
                        onClick={() => deleteOne(r)}
                      >
                        <IconTrash size={14} />
                      </button>
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
