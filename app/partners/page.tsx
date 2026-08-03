"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "../components";
import { PARTNER_TYPES } from "@/lib/config";
import { IconCopy, IconCheck, IconPlus, IconTrash } from "../icons";
import { PartnerInviteButton } from "../partner-invite";
import { PartnerGaps } from "../partner-gaps";
import { prepareLogo, sharpnessNote } from "@/lib/image";
import { useUI } from "../ui";

type PartnerStats = {
  total: number;
  active: number;
  bound: number;
  lost: number;
  byStatus: Record<string, number>;
  lastAt: string | null;
  closeRate: number | null;
};

type Partner = {
  id: string;
  name: string;
  token: string;
  emails: string[];
  logoUrl: string | null;
  partner_type: string;
  type_label: string | null;
  monthly_summary: boolean;
  thankyou_cadence: string;
  short_code: string | null;
  referrals: { count: number }[];
  stats?: PartnerStats;
};

const EMPTY_STATS: PartnerStats = {
  total: 0, active: 0, bound: 0, lost: 0, byStatus: {}, lastAt: null, closeRate: null,
};

// Initials for partners with no logo. A dashed "add logo" box on every card
// makes a page of real relationships look like a page of unfinished chores; a
// monogram looks deliberate and still opens the file picker on click.
function initials(name: string): string {
  const words = name.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function sinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "active today";
  if (days === 1) return "active yesterday";
  if (days < 30) return `active ${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "quiet for a month" : `quiet for ${months} months`;
}

// The pipeline bar. Proportional, three states, no axis and no legend of its
// own — the numbers sit directly beneath it. An empty track still draws, so a
// partner with no referrals reads as "nothing yet" rather than as a broken card.
function PipelineBar({ s }: { s: PartnerStats }) {
  if (s.total === 0) {
    return (
      <div className="h-1.5 rounded-full bg-slate-100 border border-dashed border-slate-200" />
    );
  }
  const seg = (n: number) => `${(n / s.total) * 100}%`;
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 flex">
      {s.bound > 0 && <span className="bg-emerald-500" style={{ width: seg(s.bound) }} />}
      {s.active > 0 && <span className="bg-brand" style={{ width: seg(s.active) }} />}
      {s.lost > 0 && <span className="bg-slate-300" style={{ width: seg(s.lost) }} />}
    </div>
  );
}

export default function PartnersPage() {
  const { toast, confirm, prompt } = useUI();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [ptype, setPtype] = useState("lender");
  const [typeLabel, setTypeLabel] = useState("");
  const [editType, setEditType] = useState("lender");
  const [editTypeLabel, setEditTypeLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editRecap, setEditRecap] = useState(true);
  const [editCadence, setEditCadence] = useState("off");
  const [editSaving, setEditSaving] = useState(false);
  const [qr, setQr] = useState<{ name: string; dataUrl: string; link: string } | null>(null);
  // The partner-#2 milestone: an earned moment, not a cold wall.
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [founderLink, setFounderLink] = useState<string | null>(null);
  const [proLink, setProLink] = useState<string | null>(null);
  // "Text link" dropdown state — contacts load on open, per partner.
  const [txFor, setTxFor] = useState<string | null>(null);
  const [txContacts, setTxContacts] = useState<{ id: string; name: string; phone: string }[] | null>(null);
  const [txBusy, setTxBusy] = useState<string | null>(null);
  const [txSent, setTxSent] = useState<string | null>(null);
  // Per-card action menu. Six buttons on every row turned a page of
  // relationships into a page of controls; everything but the one action an
  // agent actually repeats now lives behind this.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The add form is a task, not the point of the page — collapsed until wanted.
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/partners");
    if (res.ok) setPartners((await res.json()).partners ?? []);
  }

  // Close the action menu on any click outside it, or on Escape. A fixed
  // backdrop can't be used here: an ancestor with a blur filter becomes the
  // containing block and traps it (learned on the header menu).
  useEffect(() => {
    if (!menuFor && !txFor) return;
    const away = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.closest?.("[data-partner-menu]")) return;
      setMenuFor(null);
      setTxFor(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuFor(null);
        setTxFor(null);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menuFor, txFor]);

  useEffect(() => {
    load();
    // Checkout links, ready for the moment they're actually earned.
    fetch("/api/billing").then(async (r) => {
      if (!r.ok) return;
      const b = await r.json();
      setFounderLink(b.links?.founder ?? null);
      setProLink(b.links?.pro ?? null);
    });
  }, []);

  // Prefill the add-partner form from a partner gap or pipeline prospect.
  function fromProspect(p: { name: string | null; company: string | null; email: string | null; partner_type: string }) {
    setAddOpen(true);
    setName(p.company || p.name || "");
    setEmails(p.email ?? "");
    setPtype(p.partner_type || "lender");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Smart paste ────────────────────────────────────────────────────────────
  // Agents live in text threads with their partners. Paste anything — a text,
  // an email signature, a contact card — and we pull out the name, emails,
  // phone, and a partner-type guess. The person + mobile become the partner's
  // first team contact automatically on save.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<{ person: string | null; email: string | null; phone: string | null } | null>(null);

  function smartParse(text: string) {
    setPasteText(text);
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    const emailsFound = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    const phoneFound = (text.match(/(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g) ?? [])
      .map((p) => p.trim())
      .find((p) => p.replace(/\D/g, "").length >= 10) ?? null;

    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const isNoise = (l: string) =>
      l.includes("@") || /\d{3}[\s.\-)]/.test(l) || /^(cell|mobile|office|phone|fax|www\.|http)/i.test(l) || l.length > 60;
    const COMPANY_HINT = /\b(loans?|lending|mortgage|home|financial|realty|real estate|properties|group|team|llc|inc|bank|credit union|cpa|account|tax|title|law|insurance)\b/i;

    const personLine = lines.find((l) => !isNoise(l) && /^[A-Za-z'.\-]+\s+[A-Za-z'.\-]+/.test(l) && !COMPANY_HINT.test(l)) ?? null;
    const companyLine = lines.find((l) => !isNoise(l) && COMPANY_HINT.test(l)) ?? null;

    // Type guess from keywords anywhere in the paste.
    const t = text.toLowerCase();
    const guessedType = /nmls|loan|lender|lending|mortgage/.test(t)
      ? "lender"
      : /realtor|realty|real estate|broker|homes|listing/.test(t)
        ? "realtor"
        : /cpa|accountant|accounting|tax/.test(t)
          ? "cpa"
          : null;

    const person = personLine ? personLine.replace(/,.*$/, "").trim() : null;
    if (companyLine || person) setName(companyLine ?? person ?? "");
    if (emailsFound.length) setEmails(emailsFound.join(", "));
    if (guessedType) setPtype(guessedType);
    setParsed({ person, email: emailsFound[0] ?? null, phone: phoneFound });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emails, partner_type: ptype, type_label: typeLabel }),
    });
    setSaving(false);
    if (res.ok) {
      // Smart paste found a person? They become the first team contact —
      // mobile included, SMS consent left off until they actually say yes.
      const { partner } = await res.json();
      if (partner?.id && parsed?.person && parsed?.email) {
        await fetch(`/api/partners/${partner.id}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: parsed.person, email: parsed.email, phone: parsed.phone ?? "", sms_opt_in: false }),
        }).catch(() => {});
      }
      setName("");
      setEmails("");
      setTypeLabel("");
      setPasteText("");
      setParsed(null);
      setPasteOpen(false);
      load();
    } else {
      const err = await res.json();
      if (err.upgrade) setUpgrade(name.trim() || "your second partner");
      else toast(err.error ?? "Failed", "error");
    }
  }

  async function copy(p: Partner) {
    // Prefer the compact short link — same portal, way cleaner in a text.
    await navigator.clipboard.writeText(`${window.location.origin}/p/${p.short_code || p.token}`);
    setCopied(p.id);
    toast("Magic link copied — paste it into a text or email");
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

  async function openTx(p: Partner) {
    if (txFor === p.id) {
      setTxFor(null);
      return;
    }
    setTxFor(p.id);
    setTxContacts(null);
    const res = await fetch(`/api/partners/${p.id}/contacts`);
    const all = res.ok ? ((await res.json()).contacts ?? []) : [];
    setTxContacts(all.filter((c: any) => c.phone));
  }

  async function sendTx(pid: string, payload: { contactId?: string; phone?: string; purpose?: string }) {
    setTxFor(null);
    setTxBusy(pid);
    const res = await fetch(`/api/partners/${pid}/text-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setTxBusy(null);
    if (res.ok) {
      setTxSent(pid);
      toast(payload.purpose === "backfill" ? "Asked them to add their active files" : "Portal link sent");
      setTimeout(() => setTxSent(null), 2500);
    } else toast((await res.json()).error ?? "Couldn't send the text", "error");
  }

  async function txToNumber(pid: string) {
    const num = await prompt({ title: "Text the portal link", body: "Which mobile number should it go to?", placeholder: "(804) 555-1234", confirmLabel: "Send it" });
    if (!num) return;
    sendTx(pid, { phone: num });
  }

  // Clone a built-out partner (contacts, settings, logo) with a fresh magic
  // link and no leads — the test→official move without rekeying anything.
  const [dupBusy, setDupBusy] = useState<string | null>(null);
  async function duplicatePartner(p: Partner) {
    setDupBusy(p.id);
    const res = await fetch(`/api/partners/${p.id}/duplicate`, { method: "POST" });
    setDupBusy(null);
    if (res.ok) {
      setEditingId(null);
      load();
    } else {
      const err = await res.json();
      if (err.upgrade) setUpgrade(`${p.name} (copy)`);
      else toast(err.error ?? "Couldn't duplicate", "error");
    }
  }

  async function deletePartner(p: Partner) {
    const n = p.referrals?.[0]?.count ?? 0;
    const ok = await confirm(
      `Delete ${p.name}? Their magic link stops working immediately and ${
        n === 0 ? "" : `their ${n} referral${n === 1 ? "" : "s"}, documents, and messages are `
      }permanently removed. This can't be undone.`
    );
    if (!ok) return;
    const res = await fetch(`/api/partners/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      setEditingId(null);
      load();
    } else toast((await res.json()).error ?? "Failed to delete", "error");
  }

  const [logoNote, setLogoNote] = useState("");

  async function uploadLogo(p: Partner, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLogoNote("");
    // Sized for the portal's hero chip at retina density, transparency kept,
    // never enlarged — see lib/image.
    const prepared = await prepareLogo(file);
    const fd = new FormData();
    fd.append("file", prepared.file);
    const res = await fetch(`/api/partners/${p.id}/logo`, { method: "POST", body: fd });
    if (res.ok) {
      load();
      const note = sharpnessNote(prepared);
      if (note) setLogoNote(note);
    } else toast((await res.json()).error ?? "Upload failed", "error");
  }

  function startEdit(p: Partner) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditEmails(p.emails.join(", "));
    setEditType(p.partner_type ?? "lender");
    setEditTypeLabel(p.type_label ?? "");
    setEditRecap(p.monthly_summary !== false);
    setEditCadence(p.thankyou_cadence ?? "off");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    const res = await fetch(`/api/partners/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, emails: editEmails, partner_type: editType, type_label: editTypeLabel, monthly_summary: editRecap, thankyou_cadence: editCadence }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditingId(null);
      load();
    } else toast((await res.json()).error ?? "Failed to save", "error");
  }

  return (
    <>
      <TopNav active="partners" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Referral partners</h1>
            <p className="text-sm text-ink-secondary mt-1">
              Each partner gets a private magic link — their live window into every referral
              they&apos;ve sent you.
            </p>
          </div>
          <button
            type="button"
            className={addOpen ? "btn-ghost !py-2 text-xs shrink-0" : "btn-primary !py-2 text-xs shrink-0"}
            onClick={() => setAddOpen(!addOpen)}
          >
            {addOpen ? "Close" : (<><IconPlus size={13} /> Add partner</>)}
          </button>
        </div>

        {logoNote && (
          <div className="card px-4 py-2.5 border-amber-300 bg-amber-100">
            <p className="text-xs text-ink">{logoNote}</p>
          </div>
        )}

        <PartnerGaps onConvert={fromProspect} />

        {addOpen && (
        <form onSubmit={add} className="card p-5 space-y-3 border-brand-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-label">Add a partner</h2>
            <button
              type="button"
              className="link !text-xs"
              onClick={() => setPasteOpen(!pasteOpen)}
            >
              📋 {pasteOpen ? "Hide smart paste" : "Smart paste their info"}
            </button>
          </div>
          {pasteOpen && (
            <div className="rounded-xl border border-brand-100 bg-brand-light/40 p-3 space-y-2">
              <textarea
                className="input !h-24 text-sm resize-y"
                placeholder={"Paste anything — their text, email signature, or contact card.\ne.g.  Sarah Martin\nCowart Home Loans · NMLS 12345\nsmartin@cowart.com · (804) 555-1234"}
                value={pasteText}
                onChange={(e) => smartParse(e.target.value)}
              />
              {parsed && (
                <p className="text-[11px] text-ink-secondary">
                  Found:{" "}
                  {[
                    parsed.person && `👤 ${parsed.person}`,
                    parsed.email && `✉ ${parsed.email}`,
                    parsed.phone && `📱 ${parsed.phone}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "nothing yet — keep pasting"}
                  {parsed.person && parsed.email && (
                    <span className="text-brand-800 font-medium"> — they&apos;ll be added as the first team contact</span>
                  )}
                </p>
              )}
            </div>
          )}
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
              {ptype === "other" && (
                <input
                  className="input mt-1.5"
                  placeholder="Call it anything — e.g., Networking group"
                  maxLength={40}
                  value={typeLabel}
                  onChange={(e) => setTypeLabel(e.target.value)}
                />
              )}
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
            The type shapes their portal: lenders get the closing-date and document flow; everyone
            else gets a simple client-details form.
          </p>
          <button className="btn-primary" disabled={saving}>
            {saving ? "Adding…" : "Add partner"}
          </button>
        </form>
        )}

        <div className="space-y-3">
          {partners.map((p) => {
            const s = p.stats ?? EMPTY_STATS;
            const since = sinceLabel(s.lastAt);
            return (
            <div
              key={p.id}
              className={`card p-5 transition-shadow ${
                editingId === p.id ? "" : "hover:shadow-lift"
              }`}
            >
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
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => uploadLogo(p, e)}
                      />
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
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => duplicatePartner(p)}
                      disabled={dupBusy === p.id}
                      title="Clone this partner — same settings, team contacts, and logo, but a fresh magic link and no leads. Perfect for making a test partner official."
                    >
                      <IconCopy size={12} /> {dupBusy === p.id ? "Duplicating…" : "Duplicate partner"}
                    </button>
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
                <div className="space-y-4">
                  {/* ── Identity row ──────────────────────────────────────── */}
                  <div className="flex items-start gap-4">
                    {/* The logo box is still the upload control — hover it */}
                    <label
                      className="relative w-14 h-14 rounded-xl cursor-pointer group/logo shrink-0"
                      title={p.logoUrl ? "Replace this partner's logo" : "Upload this partner's logo"}
                    >
                      {p.logoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.logoUrl}
                            alt=""
                            className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 p-1.5"
                          />
                          <span className="absolute inset-0 rounded-xl bg-slate-900/60 text-white text-[10px] font-semibold flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                            Replace
                          </span>
                        </>
                      ) : (
                        <span className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-100 text-brand-800 flex items-center justify-center font-bold tracking-tight text-lg group-hover/logo:from-brand-100 group-hover/logo:to-brand-200 transition-colors">
                          {initials(p.name)}
                        </span>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => uploadLogo(p, e)}
                      />
                    </label>

                    <div className="min-w-0 flex-1">
                      <Link href={`/partner/${p.id}`} className="block group/name min-w-0">
                        <p className="font-bold tracking-tight text-[15px] truncate group-hover/name:text-brand transition-colors">
                          {p.name}
                        </p>
                      </Link>
                      <p className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="badge bg-slate-100 text-slate-700">
                          {p.type_label || (PARTNER_TYPES[p.partner_type] ?? "Lender")}
                        </span>
                        {since && <span>{since}</span>}
                      </p>
                    </div>

                    {/* One repeated action, one menu for the rest. */}
                    <div className="flex items-center gap-1.5 shrink-0" data-partner-menu>
                      <button
                        className="btn-primary !px-3 !py-1.5 text-xs"
                        onClick={() => copy(p)}
                        title="Copy this partner's private portal link"
                      >
                        {copied === p.id ? (
                          <>
                            <IconCheck size={12} /> Copied
                          </>
                        ) : (
                          <>
                            <IconCopy size={12} /> Copy link
                          </>
                        )}
                      </button>
                      <div className="relative">
                        <button
                          className="w-8 h-8 rounded-lg text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors flex items-center justify-center"
                          aria-label={`More actions for ${p.name}`}
                          aria-expanded={menuFor === p.id}
                          onClick={() => {
                            setTxFor(null);
                            setMenuFor(menuFor === p.id ? null : p.id);
                          }}
                        >
                          <span className="text-lg leading-none tracking-widest -mt-1">···</span>
                        </button>

                        {menuFor === p.id && txFor !== p.id && (
                          <div className="absolute right-0 top-full mt-1.5 z-30 card p-1.5 w-52 shadow-lift text-left">
                            <Link
                              href={`/partner/${p.id}`}
                              className="block rounded-lg px-2.5 py-2 text-xs font-medium hover:bg-brand-light/60 transition-colors"
                            >
                              Open workspace
                            </Link>
                            <button
                              className="w-full text-left rounded-lg px-2.5 py-2 text-xs hover:bg-brand-light/60 transition-colors"
                              onClick={() => {
                                setMenuFor(null);
                                startEdit(p);
                              }}
                            >
                              Edit details
                            </button>
                            <Link
                              href={`/p/${p.short_code || p.token}`}
                              className="block rounded-lg px-2.5 py-2 text-xs hover:bg-brand-light/60 transition-colors"
                            >
                              View their portal
                            </Link>
                            <button
                              className="w-full text-left rounded-lg px-2.5 py-2 text-xs hover:bg-brand-light/60 transition-colors"
                              onClick={() => {
                                setMenuFor(null);
                                showQr(p);
                              }}
                            >
                              Show QR code
                            </button>
                            <button
                              className="w-full text-left rounded-lg px-2.5 py-2 text-xs hover:bg-brand-light/60 transition-colors"
                              onClick={() => openTx(p)}
                              disabled={txBusy === p.id}
                            >
                              {txSent === p.id ? "Texted ✓" : txBusy === p.id ? "Sending…" : "Text the link"}
                            </button>
                            <PartnerInviteButton
                              partnerId={p.id}
                              partnerName={p.name}
                              className="w-full text-left rounded-lg px-2.5 py-2 text-xs hover:bg-brand-light/60 transition-colors flex items-center gap-1.5"
                            />
                          </div>
                        )}

                        {txFor === p.id && (
                          <div className="absolute right-0 top-full mt-1.5 z-30 card p-2 w-60 space-y-0.5 shadow-lift text-left">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted px-2 pt-1 pb-1.5">
                              Text the portal link to…
                            </p>
                            {txContacts === null ? (
                              <p className="text-[11px] text-ink-muted px-2 py-1.5">Loading contacts…</p>
                            ) : (
                              <>
                                {txContacts.map((c) => (
                                  <div key={c.id} className="rounded-lg hover:bg-brand-light/40 transition-colors px-2 py-1.5">
                                    <p className="text-xs">
                                      <span className="font-medium">{c.name}</span>
                                      <span className="text-ink-muted"> · {c.phone}</span>
                                    </p>
                                    <div className="flex gap-3 mt-0.5">
                                      <button
                                        className="link !text-[11px]"
                                        onClick={() => sendTx(p.id, { contactId: c.id })}
                                      >
                                        Send portal link
                                      </button>
                                      <button
                                        className="link !text-[11px]"
                                        title="Asks them to add the files they have working right now"
                                        onClick={() => sendTx(p.id, { contactId: c.id, purpose: "backfill" })}
                                      >
                                        Ask for active files
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {txContacts.length === 0 && (
                                  <p className="text-[11px] text-ink-muted px-2 py-1.5">
                                    No contacts with a mobile yet — or just:
                                  </p>
                                )}
                              </>
                            )}
                            <button
                              className="w-full text-left text-xs px-2 py-2 rounded-lg hover:bg-brand-light/60 text-brand font-semibold transition-colors"
                              onClick={() => {
                                setTxFor(null);
                                setMenuFor(null);
                                txToNumber(p.id);
                              }}
                            >
                              Enter a number…
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── The pipeline, which is the reason to open this page ── */}
                  <div>
                    <PipelineBar s={s} />
                    {s.total === 0 ? (
                      <p className="text-[11px] text-ink-muted mt-2">
                        No referrals logged yet.{" "}
                        <Link href={`/partner/${p.id}`} className="link !text-[11px]">
                          Add what they&apos;ve already sent you
                        </Link>{" "}
                        — a real close ratio makes the next conversation easy.
                      </p>
                    ) : (
                      <div className="mt-2.5 flex items-baseline gap-5 flex-wrap">
                        <span className="text-[11px] text-ink-muted">
                          <span className="text-base font-bold tracking-tight text-ink tabular-nums">
                            {s.total}
                          </span>{" "}
                          referral{s.total === 1 ? "" : "s"}
                        </span>
                        {s.active > 0 && (
                          <span className="text-[11px] text-ink-muted inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-brand" />
                            <span className="font-semibold text-ink tabular-nums">{s.active}</span> in
                            motion
                          </span>
                        )}
                        {s.bound > 0 && (
                          <span className="text-[11px] text-ink-muted inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="font-semibold text-ink tabular-nums">{s.bound}</span> covered
                          </span>
                        )}
                        {s.closeRate !== null && (
                          <span className="text-[11px] text-ink-muted">
                            <span className="font-semibold text-ink tabular-nums">{s.closeRate}%</span>{" "}
                            close rate
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {p.emails.length > 0 && (
                    <p className="text-[11px] text-ink-muted truncate border-t border-slate-100 pt-2.5">
                      Notifies {p.emails.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
            );
          })}

          {/* The partner-#2 milestone. They've already decided the product
              works — this reads as a moment, not a toll booth. */}
          {upgrade && (
            <div
              className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
              onClick={() => setUpgrade(null)}
            >
              <div className="card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                  Second partner
                </p>
                <h3 className="text-lg font-bold tracking-tight mt-1">This is where it compounds</h3>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                  One partner is a relationship. Two is the start of a referral base — and the
                  agents who build one stop depending on any single desk staying busy.{" "}
                  <span className="text-ink font-medium">{upgrade}</span> is ready to go live as
                  soon as you&apos;re on Pro.
                </p>
                <div className="mt-4 space-y-2">
                  {founderLink && (
                    <a href={founderLink} className="btn-primary w-full">
                      Founding member — $199/year
                    </a>
                  )}
                  {proLink && (
                    <a href={proLink} className={founderLink ? "btn-ghost w-full" : "btn-primary w-full"}>
                      Pro — $20/month
                    </a>
                  )}
                  {!founderLink && !proLink && (
                    <a href="/billing" className="btn-primary w-full">
                      See plans
                    </a>
                  )}
                  <button className="btn-ghost w-full" onClick={() => setUpgrade(null)}>
                    Not yet
                  </button>
                </div>
                <p className="text-[11px] text-ink-muted mt-3 text-center">
                  {founderLink
                    ? "The founding rate locks for as long as you keep the plan. Unlimited partners either way."
                    : "Unlimited partners, everything you already use."}
                </p>
              </div>
            </div>
          )}

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
