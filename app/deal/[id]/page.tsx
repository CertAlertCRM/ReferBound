"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { STATUSES, STATUS_LABELS, DOC_KINDS } from "@/lib/config";
import { StatusBadge, StatusProgress, TopNav } from "../../components";

type Doc = { id: string; kind: string; file_name: string; created_at: string; uploaded_by?: string };
type Activity = { id: number; event_type: string; detail: string; actor: string; created_at: string };
type Msg = { id: string; sender: string; body: string; created_at: string };
type Referral = {
  id: string;
  client_name: string;
  coborrower_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_dob: string | null;
  property_address: string | null;
  closing_date: string | null;
  status: string;
  lost_reason: string | null;
  notes: string | null;
  source: string;
  log_seconds: number | null;
  created_at: string;
  partners: { name: string } | null;
  documents: Doc[];
};

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Referral | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [premium, setPremium] = useState("");
  const [lines, setLines] = useState("");
  const [dealBaseline, setDealBaseline] = useState({ premium: "", lines: "" });
  const [dealSaving, setDealSaving] = useState(false);
  const dealDirty = premium !== dealBaseline.premium || lines !== dealBaseline.lines;
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllMsgs, setShowAllMsgs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docKind, setDocKind] = useState("eoi");
  const [docCarrier, setDocCarrier] = useState("");
  const [docStart, setDocStart] = useState("");
  const [docEnd, setDocEnd] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [showLost, setShowLost] = useState(false);

  async function load() {
    const [res, actRes, msgRes] = await Promise.all([
      fetch(`/api/referrals`),
      fetch(`/api/referrals/${id}/activity`),
      fetch(`/api/referrals/${id}/messages`),
    ]);
    if (res.ok) {
      const all: (Referral & { premium?: number | null; policy_lines?: string | null })[] =
        (await res.json()).referrals ?? [];
      const found = all.find((x) => x.id === id) ?? null;
      setR(found);
      if (found) {
        const p = found.premium != null ? String(found.premium) : "";
        const l = found.policy_lines ?? "";
        setPremium(p);
        setLines(l);
        setDealBaseline({ premium: p, lines: l });
      }
    }
    if (actRes.ok) setActivity((await actRes.json()).activity ?? []);
    if (msgRes.ok) setMsgs((await msgRes.json()).messages ?? []);
  }

  async function saveDealValue(e: React.FormEvent) {
    e.preventDefault();
    setDealSaving(true);
    await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premium, policy_lines: lines }),
    });
    setDealSaving(false);
    load();
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    setReplySending(true);
    const res = await fetch(`/api/referrals/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    setReplySending(false);
    if (res.ok) {
      setReply("");
      load();
    } else alert((await res.json()).error ?? "Failed to send");
  }
  useEffect(() => {
    load();
  }, [id]);

  async function setStatus(status: string, extra: Record<string, unknown> = {}) {
    if (status === "docs_delivered" && r && r.documents.length === 0) {
      const ok = confirm(
        "No documents are uploaded yet, but this sends the partner their one “bound + documents ready” email. Upload the EOI/RCE first, or continue anyway?"
      );
      if (!ok) return;
    }
    setBusy(true);
    const res = await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    setBusy(false);
    if (res.ok) {
      setShowLost(false);
      load();
    } else alert((await res.json()).error ?? "Failed");
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", docKind);
    fd.append("carrier_name", docCarrier);
    fd.append("effective_start", docStart);
    fd.append("effective_end", docEnd);
    const res = await fetch(`/api/referrals/${id}/docs`, { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (res.ok) load();
    else alert((await res.json()).error ?? "Upload failed");
  }

  async function del() {
    if (!confirm("Delete this referral? This cannot be undone.")) return;
    await fetch(`/api/referrals/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!r) {
    return (
      <>
        <TopNav active="referrals" />
        <main className="max-w-2xl mx-auto p-6">
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        </main>
      </>
    );
  }

  const hasEoi = r.documents.some((d) => d.kind === "eoi");

  return (
    <>
      <TopNav active="referrals" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        <Link href="/" className="text-sm font-medium text-brand hover:text-brand-dark">
          ← All referrals
        </Link>

        <header className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{r.client_name}</h1>
              <p className="text-sm text-ink-secondary mt-0.5">
                Referred by {r.partners?.name ?? "—"}
                {r.source === "partner" && " · via portal"}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
          <StatusProgress status={r.status} />
          <div className="text-sm text-ink-secondary flex flex-wrap gap-x-5 gap-y-1">
            {r.coborrower_name && <span>👥 Co-borrower: {r.coborrower_name}</span>}
            {r.client_phone && <span>📞 {r.client_phone}</span>}
            {r.client_email && <span>✉️ {r.client_email}</span>}
            {r.client_dob && <span>🎂 DOB {r.client_dob}</span>}
            {r.property_address && <span>📍 {r.property_address}</span>}
            {r.closing_date && <span>🏠 Closes {r.closing_date}</span>}
            {r.log_seconds !== null && (
              <span className="text-ink-muted text-xs self-center">logged in {r.log_seconds}s</span>
            )}
          </div>
          {r.notes && <p className="text-sm text-ink-muted border-t border-slate-100 pt-3">“{r.notes}”</p>}
        </header>

        {/* Status controls */}
        <section className="card p-6 space-y-3.5">
          <h2 className="section-label">Update status</h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                disabled={busy || r.status === s}
                className={`${r.status === s ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <button
              onClick={() => setShowLost(!showLost)}
              disabled={busy}
              className={`${r.status === "lost" ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
            >
              {STATUS_LABELS.lost}
            </button>
          </div>
          {showLost && (
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Reason (optional — e.g., carrier declined, client went elsewhere)"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
              <button className="btn-primary shrink-0" onClick={() => setStatus("lost", { lost_reason: lostReason })}>
                Confirm
              </button>
            </div>
          )}
          {r.status === "bound" && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Bound ✓ — no email has gone to {r.partners?.name} yet.{" "}
              {hasEoi
                ? "Docs are uploaded — mark “EOI & docs delivered” to send their one combined bound + documents email."
                : "Upload the EOI (and RCE) below, then mark “EOI & docs delivered” to send their one combined bound + documents email."}
            </p>
          )}
        </section>

        {/* Documents */}
        <section className="card p-6 space-y-3.5">
          <h2 className="section-label">Documents</h2>
          {r.documents.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {r.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium">{DOC_KINDS[d.kind] ?? d.kind}</span>
                    <span className="text-ink-muted"> — {d.file_name}</span>
                    {d.uploaded_by === "partner" && (
                      <span className="badge bg-brand-light text-brand-700 ml-2">from partner</span>
                    )}
                  </span>
                  <a
                    className="text-brand font-medium text-xs hover:text-brand-dark"
                    href={`/api/docs/${d.id}/download`}
                    target="_blank"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className="input" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
              {Object.entries(DOC_KINDS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Carrier (optional)"
              value={docCarrier}
              onChange={(e) => setDocCarrier(e.target.value)}
            />
            <label className="block text-xs text-ink-muted">
              Policy effective date
              <input type="date" className="input mt-1" value={docStart} onChange={(e) => setDocStart(e.target.value)} />
            </label>
            <label className="block text-xs text-ink-muted">
              Policy expiration date
              <input type="date" className="input mt-1" value={docEnd} onChange={(e) => setDocEnd(e.target.value)} />
            </label>
          </div>
          <label className="btn-ghost cursor-pointer">
            {uploading ? "Uploading…" : "Upload file"}
            <input
              type="file"
              className="hidden"
              onChange={upload}
              disabled={uploading}
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
          </label>
          <p className="text-xs text-ink-muted">
            Partners can download these from their portal once the deal is bound / delivered. The expiration
            date powers renewal-time EOI refresh reminders later — worth filling in for EOI and dec pages.
          </p>
        </section>

        {/* Messages with partner */}
        <section className="card p-6 space-y-3.5">
          <h2 className="section-label">Messages with {r.partners?.name ?? "partner"}</h2>
          {msgs.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No messages yet. Anything you send lands in their portal and their inbox.
            </p>
          ) : (
            <div className="space-y-2.5">
              {msgs.length > 3 && !showAllMsgs && (
                <button
                  onClick={() => setShowAllMsgs(true)}
                  className="text-xs font-semibold text-brand hover:text-brand-dark"
                >
                  Show earlier messages ({msgs.length - 3})
                </button>
              )}
              {(showAllMsgs ? msgs : msgs.slice(-3)).map((m) => (
                <div
                  key={m.id}
                  className={`text-sm rounded-xl px-3.5 py-2.5 max-w-[85%] ${
                    m.sender === "agent" ? "bg-brand-light ml-auto" : "bg-slate-100"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-0.5">
                    {m.sender === "agent" ? "You" : r.partners?.name ?? "Partner"} ·{" "}
                    {new Date(m.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  {m.body}
                </div>
              ))}
            </div>
          )}
          <form onSubmit={sendReply} className="flex gap-2">
            <input
              className="input"
              placeholder="Send an update or answer a question…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={2000}
            />
            <button className="btn-primary shrink-0" disabled={replySending || !reply.trim()}>
              {replySending ? "…" : "Send"}
            </button>
          </form>
        </section>

        {/* Deal value */}
        <section className="card p-6 space-y-3.5">
          <h2 className="section-label">Deal value</h2>
          <form onSubmit={saveDealValue} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">Annual premium ($)</span>
              <input
                className="input mt-1"
                placeholder="2400"
                inputMode="decimal"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Lines written</span>
              <input
                className="input mt-1"
                placeholder="Home + Auto"
                value={lines}
                onChange={(e) => setLines(e.target.value)}
              />
            </label>
            <div className="flex items-end">
              <button className="btn-ghost w-full" disabled={dealSaving || !dealDirty}>
                {dealSaving ? "Saving…" : dealDirty ? "Save" : "Saved ✓"}
              </button>
            </div>
          </form>
          <p className="text-xs text-ink-muted">
            Feeds your Stats page — premium sourced per partner is the number that proves what each
            relationship is worth. Never shown to partners.
          </p>
        </section>

        {/* Activity timeline — latest entry up front, full history on demand */}
        <section className="card p-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="section-label">Latest activity</h2>
            {activity.length > 1 && (
              <button
                onClick={() => setShowAllActivity(!showAllActivity)}
                className="text-xs font-semibold text-brand hover:text-brand-dark"
              >
                {showAllActivity ? "Show less" : `Full history (${activity.length - 1} more)`}
              </button>
            )}
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-ink-muted">No activity recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-slate-200">
              {(showAllActivity ? activity : activity.slice(0, 1)).map((a) => (
                <li key={a.id} className="relative pl-5">
                  <span
                    className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-white ${
                      a.actor === "partner"
                        ? "bg-brand"
                        : a.actor === "system"
                        ? "bg-amber-400"
                        : "bg-slate-400"
                    }`}
                  />
                  <p className="text-sm text-ink">{a.detail}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {new Date(a.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {a.actor}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-ink-muted">
            This timeline is append-only — entries can&apos;t be edited or deleted, so it stands as a
            permanent record of every touch on this referral.
          </p>
        </section>

        <div className="text-center">
          <button onClick={del} className="text-xs text-ink-muted hover:text-red-600 transition-colors">
            Delete referral
          </button>
        </div>
      </main>
    </>
  );
}
