"use client";

import { useEffect, useState } from "react";
import { TopNav } from "../components";
import { formatPhoneInput } from "@/lib/format";
import { IconDownload, IconZap, IconUsers, IconCopy, IconCheck, IconX } from "../icons";

type Team = {
  role: "owner" | "member";
  plan?: string;
  members?: { id: string; email: string; display_name: string | null; created_at: string }[];
  seatLimit?: number;
  seatsUsed?: number;
  inviteUrl?: string | null;
  ownerEmail?: string;
};

type Profile = {
  display_name: string | null;
  agency_name: string | null;
  office: string | null;
  phone: string | null;
  email: string | null;
  google_review_url: string | null;
  sms_new_lead: boolean;
};

const EMPTY: Profile = { display_name: "", agency_name: "", office: "", phone: "", email: "", google_review_url: "", sms_new_lead: false };

export default function ProfilePage() {
  const [form, setForm] = useState<Profile>(EMPTY);
  const [baseline, setBaseline] = useState<Profile>(EMPTY);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [webhook, setWebhook] = useState("");
  const [webhookBaseline, setWebhookBaseline] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "failed">("idle");
  const [testError, setTestError] = useState("");
  const [team, setTeam] = useState<Team | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const webhookDirty = webhook.trim() !== webhookBaseline.trim();

  useEffect(() => {
    fetch("/api/profile").then(async (res) => {
      if (res.ok) {
        const { profile, headshotUrl } = await res.json();
        if (profile) {
          const loaded = {
            display_name: profile.display_name ?? "",
            agency_name: profile.agency_name ?? "",
            office: profile.office ?? "",
            phone: profile.phone ?? "",
            email: profile.email ?? "",
            google_review_url: profile.google_review_url ?? "",
            sms_new_lead: Boolean(profile.sms_new_lead),
          };
          setForm(loaded);
          setBaseline(loaded);
        }
        setHeadshotUrl(headshotUrl);
      }
      setLoading(false);
    });
    fetch("/api/integrations").then(async (res) => {
      if (res.ok) {
        const { webhook_url } = await res.json();
        setWebhook(webhook_url ?? "");
        setWebhookBaseline(webhook_url ?? "");
      }
    });
    loadTeam();
  }, []);

  async function loadTeam() {
    const r = await fetch("/api/team");
    if (r.ok) setTeam(await r.json());
  }

  async function makeInvite() {
    setInviteBusy(true);
    const r = await fetch("/api/team", { method: "POST" });
    setInviteBusy(false);
    if (r.ok) {
      const { inviteUrl } = await r.json();
      setTeam((t) => (t ? { ...t, inviteUrl } : t));
    } else {
      alert((await r.json()).error ?? "Couldn't create the invite link");
    }
  }

  async function copyInvite() {
    if (!team?.inviteUrl) return;
    await navigator.clipboard.writeText(team.inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  }

  async function removeMember(id: string, email: string) {
    if (!confirm(`Remove ${email} from your team? They keep their login but lose access to the agency's shared partners and referrals.`)) return;
    setRemoveBusy(id);
    const r = await fetch(`/api/team?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setRemoveBusy(null);
    if (r.ok) loadTeam();
    else alert((await r.json()).error ?? "Couldn't remove that member");
  }

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setWebhookSaving(true);
    const res = await fetch("/api/integrations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: webhook.trim() }),
    });
    setWebhookSaving(false);
    if (res.ok) {
      setWebhookBaseline(webhook.trim());
      setTestState("idle");
    } else {
      alert((await res.json()).error ?? "Failed to save");
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteBusy(true);
    setDeleteError("");
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: deleteConfirm }),
    });
    if (res.ok) {
      window.location.href = "/welcome";
    } else {
      setDeleteBusy(false);
      setDeleteError((await res.json()).error ?? "Deletion failed");
    }
  }

  async function sendTest() {
    setTestState("sending");
    setTestError("");
    const res = await fetch("/api/integrations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: webhook.trim() }),
    });
    if (res.ok) {
      setTestState("ok");
    } else {
      setTestState("failed");
      setTestError((await res.json()).error ?? "Test failed");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setBaseline({ ...form });
    } else {
      alert((await res.json()).error ?? "Failed to save");
    }
  }

  async function uploadHeadshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/headshot", { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (res.ok) setHeadshotUrl((await res.json()).headshotUrl);
    else alert((await res.json()).error ?? "Upload failed");
  }

  const field = (key: keyof Profile, label: string, placeholder: string) => {
    const isPhone = key === "phone";
    const isEmail = key === "email";
    const isOffice = key === "office";
    return (
      <label className="block">
        <span className="section-label">{label}</span>
        <input
          className="input mt-1.5"
          type={isPhone ? "tel" : isEmail ? "email" : "text"}
          inputMode={isPhone ? "tel" : isEmail ? "email" : undefined}
          autoComplete={isOffice ? "street-address" : undefined}
          placeholder={placeholder}
          value={form[key] ?? ""}
          onChange={(e) =>
            setForm({ ...form, [key]: isPhone ? formatPhoneInput(e.target.value) : e.target.value })
          }
        />
      </label>
    );
  };

  return (
    <>
      <TopNav active="profile" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your profile</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Your name and agency appear on every partner portal — this is how partners see you.
          </p>
        </div>

        {loading ? (
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        ) : (
          <>
            <section className="card p-6 flex items-center gap-5">
              {headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headshotUrl}
                  alt="Headshot"
                  className="w-28 h-28 rounded-full object-cover border-2 border-slate-200"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-brand-light text-brand-700 flex items-center justify-center text-3xl font-bold">
                  {(form.display_name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <label className="btn-ghost cursor-pointer">
                  {uploading ? "Uploading…" : headshotUrl ? "Replace headshot" : "Upload headshot"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={uploadHeadshot}
                    disabled={uploading}
                  />
                </label>
                <p className="text-xs text-ink-muted mt-2">JPG or PNG, up to 5MB. Square photos look best.</p>
              </div>
            </section>

            <form onSubmit={save} className="card p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field("display_name", "Your name", "David Falden")}
                {field("agency_name", "Agency name", "Your agency")}
              </div>
              {field("office", "Office", "Street, city, state")}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field("phone", "Phone", "804-555-1234")}
                {field("email", "Email", "you@example.com")}
              </div>
              <label className="block">
                <span className="section-label">Google review link</span>
                <input
                  className="input mt-1.5"
                  type="url"
                  inputMode="url"
                  placeholder="https://g.page/r/…/review"
                  value={form.google_review_url ?? ""}
                  onChange={(e) => setForm({ ...form, google_review_url: e.target.value })}
                />
                <span className="text-xs text-ink-muted mt-1 block">
                  Google Business Profile → &ldquo;Ask for reviews&rdquo; → copy the short link.
                  Powers the one-tap review request on bound deals.
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-brand"
                  checked={form.sms_new_lead}
                  onChange={(e) => setForm({ ...form, sms_new_lead: e.target.checked })}
                />
                <span>
                  <span className="text-sm font-medium block">Text me when a new referral arrives</span>
                  <span className="text-xs text-ink-muted">
                    Uses the phone number above. The one moment worth a buzz — a partner just sent
                    you business.
                  </span>
                </span>
              </label>
              <button className="btn-primary" disabled={saving || !dirty}>
                {saving ? "Saving…" : dirty ? "Save profile" : "Saved ✓"}
              </button>
            </form>

            {team?.role === "member" && (
              <section className="card p-5 flex items-start gap-3">
                <IconUsers size={16} className="text-brand mt-0.5 shrink-0" />
                <p className="text-sm text-ink-secondary">
                  You&apos;re part of the agency team run by{" "}
                  <span className="font-medium text-ink">{team.ownerEmail}</span> — you share the
                  same partners, referrals, and this agency profile.
                </p>
              </section>
            )}

            {team?.role === "owner" && team.plan === "agency" && (
              <section className="card p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-semibold flex items-center gap-2">
                    <IconUsers size={16} className="text-brand" /> Your team
                  </h2>
                  <span className="text-xs text-ink-muted">
                    {team.seatsUsed} of {team.seatLimit} seats used
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 p-4 space-y-2">
                  <p className="text-sm font-semibold">Invite a teammate</p>
                  <p className="text-xs text-ink-secondary">
                    Send them this link — they create their own login and instantly share your
                    partners, referrals, and agency profile. Generating a new link disables the
                    old one.
                  </p>
                  {team.inviteUrl ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-[11px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 break-all flex-1 min-w-0">
                        {team.inviteUrl}
                      </code>
                      <button type="button" className="btn-ghost shrink-0" onClick={copyInvite}>
                        {inviteCopied ? <IconCheck size={13} className="text-emerald-600" /> : <IconCopy size={13} />}
                        {inviteCopied ? "Copied" : "Copy"}
                      </button>
                      <button type="button" className="btn-ghost shrink-0" onClick={makeInvite} disabled={inviteBusy}>
                        {inviteBusy ? "…" : "New link"}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-primary" onClick={makeInvite} disabled={inviteBusy}>
                      {inviteBusy ? "Creating…" : "Create invite link"}
                    </button>
                  )}
                </div>

                {(team.members?.length ?? 0) > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {team.members!.map((m) => (
                      <li key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.display_name || m.email}</p>
                          {m.display_name && <p className="text-xs text-ink-muted truncate">{m.email}</p>}
                        </div>
                        <button
                          type="button"
                          className="btn-ghost !py-1 text-xs shrink-0"
                          onClick={() => removeMember(m.id, m.email)}
                          disabled={removeBusy === m.id}
                        >
                          <IconX size={12} /> {removeBusy === m.id ? "Removing…" : "Remove"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="card p-6 space-y-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <IconZap size={16} className="text-brand" /> CRM & AMS integrations
                </h2>
                <p className="text-sm text-ink-secondary mt-1">
                  Push every new lead into AgencyZoom, Agency MVP, or any other system — no
                  rekeying.
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 p-4">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <IconDownload size={15} /> Spreadsheet export
                </p>
                <p className="text-xs text-ink-secondary mt-1">
                  Opens in Excel or Google Sheets, and imports into any AMS that accepts a file.
                  &ldquo;New&rdquo; skips anything you&apos;ve already exported, so you never re-key
                  a duplicate — each export stamps the leads it includes.
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <a href="/api/export?scope=new" className="btn-primary inline-flex">
                    <IconDownload size={15} /> Export new leads
                  </a>
                  <a href="/api/export?scope=all" className="btn-ghost inline-flex">
                    Export everything
                  </a>
                </div>
              </div>

              <form onSubmit={saveWebhook} className="rounded-xl border border-slate-100 p-4 space-y-3">
                <p className="text-sm font-semibold">Webhook (works with Zapier & Make)</p>
                <p className="text-xs text-ink-secondary">
                  When a lead comes in or a status changes, ReferBound sends the details to this
                  URL as JSON. In Zapier: create a Zap with the{" "}
                  <span className="font-medium text-ink">Webhooks by Zapier → Catch Hook</span>{" "}
                  trigger, paste its URL here, hit Send test, then map the fields into your CRM
                  once. Every lead after that flows in automatically.
                </p>
                <input
                  className="input"
                  type="url"
                  inputMode="url"
                  placeholder="https://hooks.zapier.com/hooks/catch/…"
                  value={webhook}
                  onChange={(e) => {
                    setWebhook(e.target.value);
                    setTestState("idle");
                  }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <button className="btn-primary" disabled={webhookSaving || !webhookDirty}>
                    {webhookSaving ? "Saving…" : webhookDirty ? "Save webhook" : "Saved ✓"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={testState === "sending" || !webhook.trim()}
                    onClick={sendTest}
                  >
                    {testState === "sending" ? "Sending…" : "Send test"}
                  </button>
                  {testState === "ok" && (
                    <span className="text-xs text-emerald-600 font-medium">
                      Test delivered ✓ — check your Zap for the sample lead
                    </span>
                  )}
                  {testState === "failed" && (
                    <span className="text-xs text-red-600 font-medium">{testError}</span>
                  )}
                </div>
              </form>
            </section>

            <section className="card p-6 space-y-3 border-red-100">
              <div>
                <h2 className="font-semibold text-red-700">Delete account</h2>
                <p className="text-sm text-ink-secondary mt-1">
                  Permanently removes your account, partners, referrals, messages, and documents.
                  Partner magic links stop working immediately. This can&apos;t be undone —{" "}
                  <a href="/api/export" className="link !text-sm">
                    export your referrals first
                  </a>
                  .
                </p>
              </div>
              {!showDelete ? (
                <button type="button" className="btn-ghost !text-red-600" onClick={() => setShowDelete(true)}>
                  Delete my account…
                </button>
              ) : (
                <form onSubmit={deleteAccount} className="space-y-2">
                  <label className="block">
                    <span className="text-xs text-ink-secondary">
                      Type your account email to confirm:
                    </span>
                    <input
                      className="input mt-1.5"
                      type="email"
                      inputMode="email"
                      placeholder={form.email || "you@youragency.com"}
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      required
                    />
                  </label>
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-primary !bg-red-600 hover:!bg-red-700"
                      disabled={deleteBusy || !deleteConfirm.trim()}
                    >
                      {deleteBusy ? "Deleting…" : "Permanently delete"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setShowDelete(false);
                        setDeleteConfirm("");
                        setDeleteError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
