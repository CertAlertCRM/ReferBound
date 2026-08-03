"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { STATUSES, STATUS_LABELS, DOC_KINDS, SENSITIVE_DOC_KINDS, statusesFor, statusLabel, isFullTrack } from "@/lib/config";
import { StatusBadge, StatusProgress, TopNav } from "../../components";
import {
  IconMail,
  IconSparkles,
  IconPhone,
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconHome,
  IconDownload,
  IconUpload,
  IconArrowLeft,
  IconTrash,
  IconFile,
  IconAlert,
  IconCheck,
} from "../../icons";
import { useUI } from "../../ui";
import { SkeletonPanels } from "../../skeleton";
import { ClientTrack } from "./client-track";
import { LenderLink } from "./lender-link";

type Doc = { id: string; kind: string; file_name: string; created_at: string; uploaded_by?: string; purged_at?: string | null };
type Activity = { id: number; event_type: string; detail: string; actor: string; created_at: string };
type Msg = { id: string; sender: string; body: string; created_at: string };
type Referral = {
  id: string;
  client_name: string;
  coborrower_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_dob: string | null;
  coborrower_dob: string | null;
  property_address: string | null;
  closing_date: string | null;
  status: string;
  lost_reason: string | null;
  notes: string | null;
  source: string;
  log_seconds: number | null;
  created_at: string;
  partners: { name: string; partner_type?: string } | null;
  documents: Doc[];
  closing_date_was?: string | null;
  closing_date_changed_at?: string | null;
  deal_lender?: { name?: string | null; company?: string | null; email?: string | null; phone?: string | null } | null;
  lender_docs_sent_at?: string | null;
  quote_sent_at?: string | null;
  welcome_sent_at?: string | null;
  client_nudged_at?: string | null;
};

export default function DealPage() {
  const { toast, confirm } = useUI();
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
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<{ filled: string[]; mismatches: string[]; summary: string | null } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docKind, setDocKind] = useState("eoi");
  const [docCarrier, setDocCarrier] = useState("");
  const [docStart, setDocStart] = useState("");
  const [docEnd, setDocEnd] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [showLost, setShowLost] = useState(false);
  // Telling a partner a deal died — one button, never automatic. Most files
  // just go quiet and that's fine; this is for when they ask.
  const [lostNote, setLostNote] = useState<string | null>(null);
  const [lostBusy, setLostBusy] = useState(false);
  const [lostSent, setLostSent] = useState(false);
  // Password-protected loan documents: lenders send the file and the
  // password in separate emails, so the agent supplies it once here.
  const [unlockFor, setUnlockFor] = useState<string | null>(null);
  const [unlockPw, setUnlockPw] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockErr, setUnlockErr] = useState("");
  const [reviewState, setReviewState] = useState<"idle" | "sending" | "sent" | "already">("idle");
  const [touchBusy, setTouchBusy] = useState<string | null>(null);
  const [touchDone, setTouchDone] = useState<string | null>(null);
  const [teamContacts, setTeamContacts] = useState<{ id: string; name: string; role: string | null }[]>([]);
  // Pre-delivery cross-check
  const [check, setCheck] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [gate, setGate] = useState<any | null>(null);
  const checkPassed = Boolean(check && check.findings?.length === 0);
  // Coverage record — only visible once used, or behind a one-line link.
  const [covOpen, setCovOpen] = useState(false);
  const [covName, setCovName] = useState("");
  const [covOutcome, setCovOutcome] = useState("declined");
  const [covNote, setCovNote] = useState("");
  const [covEntries, setCovEntries] = useState<any[]>([]);

  async function addCoverage() {
    if (!covName.trim()) return;
    const res = await fetch(`/api/referrals/${id}/coverage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverage: covName, outcome: covOutcome, note: covNote }),
    });
    if (res.ok) {
      setCovEntries((await res.json()).entries ?? []);
      setCovName("");
      setCovNote("");
      load();
    } else toast((await res.json()).error ?? "Couldn't save", "error");
  }

  useEffect(() => {
    const pid = (r as any)?.partner_id;
    if (!pid) return;
    fetch(`/api/partners/${pid}/contacts`)
      .then(async (res) => res.ok && setTeamContacts((await res.json()).contacts ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(r as any)?.partner_id]);

  async function setContact(contactId: string) {
    await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId || null }),
    });
    load();
  }

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
        if ((found as any).doc_check) setCheck((found as any).doc_check);
        setCovEntries(Array.isArray((found as any).coverage_notes) ? (found as any).coverage_notes : []);
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

  async function extractDoc(docId: string) {
    setExtracting(docId);
    setExtractResult(null);
    const res = await fetch(`/api/referrals/${id}/docs/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: docId }),
    });
    setExtracting(null);
    if (res.ok) {
      setExtractResult(await res.json());
      load();
    } else {
      toast((await res.json()).error ?? "Extraction failed", "error");
    }
  }

  async function draftReply() {
    setDrafting(true);
    const res = await fetch(`/api/referrals/${id}/draft-reply`, { method: "POST" });
    setDrafting(false);
    if (res.ok) setReply((await res.json()).draft ?? "");
    else toast((await res.json()).error ?? "Couldn't draft — write it manually", "error");
  }

  function askForMissing(missing: string[]) {
    if (!r) return;
    setReply(
      `Hi! To get ${r.client_name}'s quote moving, could you send over their ${missing.join(" and ")}? Thanks!`
    );
  }

  // One-off cleanup: remove an accidental document or message. The portal
  // stops showing it immediately; emails already delivered can't be recalled.
  async function deleteDoc(docId: string, label: string) {
    if (
      !await confirm(
        `Remove "${label}"? It disappears from ${r?.partners?.name ?? "the partner"}'s portal immediately. If an email about it already went out, that email can't be recalled.`
      )
    )
      return;
    const res = await fetch(`/api/docs/${docId}`, { method: "DELETE" });
    if (res.ok) load();
    else toast((await res.json()).error ?? "Couldn't delete", "error");
  }

  // Keep the extracted details, delete the file that carried them. Real
  // deletion, not a blur — a black box over a PDF leaves the text underneath.
  async function purgeDoc(docId: string, label: string) {
    if (
      !await confirm(
        `Remove the source file for "${label}"?\n\nEverything already extracted (client details, dates, premium) stays on this deal. The original file — which may carry SSN, income, and asset information you don't need — is permanently deleted from storage.`
      )
    )
      return;
    const res = await fetch(`/api/docs/${docId}/purge`, { method: "POST" });
    if (res.ok) {
      toast("Source file deleted — extracted details kept");
      load();
    }
    else toast((await res.json()).error ?? "Couldn't remove the file", "error");
  }

  async function deleteMsg(messageId: string) {
    if (
      !await confirm(
        "Remove this message from the thread? It disappears from the portal immediately. If it already went out by email, that email can't be recalled."
      )
    )
      return;
    const res = await fetch(`/api/referrals/${id}/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (res.ok) load();
    else toast((await res.json()).error ?? "Couldn't delete", "error");
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
    } else toast((await res.json()).error ?? "Failed to send", "error");
  }
  useEffect(() => {
    load();
  }, [id]);

  async function logTouch(type: string) {
    setTouchBusy(type);
    const res = await fetch(`/api/referrals/${id}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    setTouchBusy(null);
    if (res.ok) {
      setTouchDone(type);
      setTimeout(() => setTouchDone(null), 1500);
      load();
    } else {
      toast((await res.json()).error ?? "Couldn't log that", "error");
    }
  }

  async function unlockDoc(docId: string) {
    setUnlockBusy(true);
    setUnlockErr("");
    const res = await fetch(`/api/referrals/${id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: docId, password: unlockPw }),
    });
    setUnlockBusy(false);
    if (res.ok) {
      setUnlockFor(null);
      setUnlockPw("");
      toast("Unlocked and read");
      load();
    } else setUnlockErr((await res.json()).error ?? "Couldn't unlock that");
  }

  async function requestReview() {
    setReviewState("sending");
    const res = await fetch(`/api/referrals/${id}/review-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const { already } = await res.json();
      setReviewState(already ? "already" : "sent");
      load();
    } else {
      setReviewState("idle");
      toast((await res.json()).error ?? "Couldn't send the review request", "error");
    }
  }

  // Cross-check the EOI/RCE against what the lender sent. Runs on demand, and
  // automatically as a gate before the "documents ready" email goes out.
  async function runCheck(silent = false): Promise<any | null> {
    setChecking(true);
    const res = await fetch(`/api/referrals/${id}/verify`, { method: "POST" });
    setChecking(false);
    if (!res.ok) {
      const e = await res.json();
      if (!silent) setCheckError(e.error ?? "Couldn't run the check");
      return null;
    }
    setCheckError("");
    const result = await res.json();
    setCheck(result);
    return result;
  }

  async function setStatus(status: string, extra: Record<string, unknown> = {}) {
    if (status === "docs_delivered" && r && r.documents.length === 0) {
      const ok = await confirm(
        "No documents are uploaded yet, but this sends the partner their one “bound + documents ready” email. Upload the EOI/RCE first, or continue anyway?"
      );
      if (!ok) return;
    }
    // The gate: never let a wrong mortgagee clause or a missing co-borrower
    // reach the lender. Runs once; the agent can still choose to send.
    if (status === "docs_delivered" && r && r.documents.length > 0 && !checkPassed) {
      const result = check ?? (await runCheck(true));
      if (result && result.findings?.length > 0) {
        setGate(result);
        return;
      }
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
    } else toast((await res.json()).error ?? "Failed", "error");
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
    else toast((await res.json()).error ?? "Upload failed", "error");
  }

  async function del() {
    if (!await confirm("Delete this referral? This cannot be undone.")) return;
    await fetch(`/api/referrals/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!r) {
    return (
      <>
        <TopNav active="referrals" />
        <main className="max-w-2xl mx-auto p-6">
          <SkeletonPanels count={4} />
        </main>
      </>
    );
  }

  const hasEoi = r.documents.some((d) => d.kind === "eoi");
  const partnerType = r.partners?.partner_type ?? "lender";
  const fullTrack = isFullTrack(partnerType);

  // Quote-readiness: the fields an agent actually needs before quoting.
  const missing: string[] = [];
  if (!r.client_dob) missing.push("date of birth");
  if (r.coborrower_name && !r.coborrower_dob) missing.push("co-borrower date of birth");
  if (!r.property_address) missing.push("property address");
  if (!r.client_phone) missing.push("phone number");
  const activeDeal = !["bound", "docs_delivered", "lost"].includes(r.status);

  return (
    <>
      <TopNav active="referrals" />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        <Link href="/" className="link-back">
          <IconArrowLeft size={15} /> All referrals
        </Link>

        <header className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{r.client_name}</h1>
              <p className="text-sm text-ink-secondary mt-0.5">
                Referred by{" "}
                {teamContacts.length > 0 ? (
                  <select
                    className="inline-block bg-transparent border-b border-dashed border-slate-300 text-sm text-ink-secondary focus:outline-none cursor-pointer"
                    value={(r as any).contact_id ?? ""}
                    onChange={(e) => setContact(e.target.value)}
                    title="Who at the partner sent this lead? Their updates route to that person."
                  >
                    <option value="">{r.partners?.name ?? "—"} (whole team)</option>
                    {teamContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} at {r.partners?.name ?? "—"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>{(r as any).partner_contacts?.name
                    ? `${(r as any).partner_contacts.name} at ${r.partners?.name ?? "—"}`
                    : (r.partners?.name ?? "—")}</>
                )}
                {r.source === "partner" && " · via portal"}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
          <StatusProgress status={r.status} />
          <div className="text-sm text-ink-secondary flex flex-wrap gap-x-5 gap-y-1.5">
            {r.coborrower_name && (
              <span className="meta-item">
                <IconUsers size={14} className="text-ink-muted" /> {r.coborrower_name}
                {r.coborrower_dob && (
                  <span className="text-ink-muted"> · {r.coborrower_dob}</span>
                )}
              </span>
            )}
            {r.client_phone && (
              <span className="meta-item"><IconPhone size={14} className="text-ink-muted" /> {r.client_phone}</span>
            )}
            {r.client_email && (
              <span className="meta-item"><IconMail size={14} className="text-ink-muted" /> {r.client_email}</span>
            )}
            {r.client_dob && (
              <span className="meta-item"><IconCalendar size={14} className="text-ink-muted" /> DOB {r.client_dob}</span>
            )}
            {r.property_address && (
              <span className="meta-item"><IconMapPin size={14} className="text-ink-muted" /> {r.property_address}</span>
            )}
            {r.closing_date && (
              <span className="meta-item">
                <IconHome size={14} className="text-ink-muted" /> Closes {r.closing_date}
                {r.closing_date_changed_at && r.closing_date_was && (
                  <span className="badge bg-amber-50 text-amber-700 ml-1.5 !text-[10px]">
                    moved from {r.closing_date_was}
                  </span>
                )}
              </span>
            )}
            {r.log_seconds !== null && (
              <span className="text-ink-muted text-xs self-center">logged in {r.log_seconds}s</span>
            )}
          </div>
          {r.notes && <p className="text-sm text-ink-muted border-t border-slate-100 pt-3">“{r.notes}”</p>}

          {activeDeal && (
            <div className="border-t border-slate-100 pt-3 flex items-center gap-3 flex-wrap">
              {missing.length === 0 ? (
                <span className="badge bg-emerald-50 text-emerald-700">✓ Ready to quote — all key info in</span>
              ) : (
                <>
                  <span className="badge bg-amber-50 text-amber-700">
                    Missing: {missing.join(", ")}
                  </span>
                  <button onClick={() => askForMissing(missing)} className="link">
                    <IconSparkles size={13} /> Draft an ask to {r.partners?.name ?? "partner"}
                  </button>
                </>
              )}
            </div>
          )}
        </header>

        {/* Status controls */}
        <section className="card p-6 space-y-3.5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="section-label">Update status</h2>
            <p className="text-[11px] text-ink-muted">
              {fullTrack
                ? `✉ = emails ${r.partners?.name ?? "your partner"} · everything else updates silently`
                : "Updates their portal live — no email unless you send one"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* A realtor or a friend who sent you a buyer doesn't need the EOI
                pipeline — they need got it, working it, covered. Same stored
                values, shorter track, plainer words. */}
            {statusesFor(partnerType).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                disabled={busy || r.status === s}
                className={`${r.status === s ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
                title={
                  s === "quoted"
                    ? `Sends ${r.partners?.name ?? "your partner"} a "quoted" email`
                    : s === "docs_delivered"
                      ? `Sends ${r.partners?.name ?? "your partner"} the one combined bound + documents email`
                      : "Updates the portal silently — no email"
                }
              >
                {statusLabel(s, partnerType)}
                {(s === "quoted" || s === "docs_delivered") && <span aria-hidden> ✉</span>}
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
          {fullTrack && r.status === "bound" && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Bound ✓ — no email has gone to {r.partners?.name} yet.{" "}
              {hasEoi
                ? "Docs are uploaded — mark “EOI & docs delivered” to send their one combined bound + documents email."
                : "Upload the EOI (and RCE) below, then mark “EOI & docs delivered” to send their one combined bound + documents email."}
            </p>
          )}
          {r.status === "lost" && !lostSent && (
            <div className="space-y-2 pt-1">
              {lostNote === null ? (
                <button
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                  disabled={lostBusy}
                  onClick={async () => {
                    setLostBusy(true);
                    const res = await fetch(`/api/referrals/${id}/notify-lost`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    setLostBusy(false);
                    if (res.ok) setLostNote((await res.json()).draft);
                  }}
                >
                  {lostBusy ? "…" : `Let ${r.partners?.name ?? "them"} know`}
                </button>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[11px] text-ink-secondary">
                    Only if it&apos;s worth sending. Most files just go quiet, and a note on every
                    one of those is a small announcement nobody asked for.
                  </p>
                  <textarea
                    className="input !text-[13px] min-h-[130px] font-sans"
                    value={lostNote}
                    onChange={(e) => setLostNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn-primary !py-1.5 !px-3 text-xs"
                      disabled={lostBusy || !lostNote.trim()}
                      onClick={async () => {
                        setLostBusy(true);
                        const res = await fetch(`/api/referrals/${id}/notify-lost`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ message: lostNote }),
                        });
                        setLostBusy(false);
                        if (res.ok) {
                          setLostSent(true);
                          toast("Sent");
                          load();
                        } else toast((await res.json()).error ?? "Couldn't send", "error");
                      }}
                    >
                      {lostBusy ? "Sending…" : "Send it"}
                    </button>
                    <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setLostNote(null)}>
                      Never mind
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {lostSent && (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              Sent — logged on the timeline.
            </p>
          )}

          {["bound", "docs_delivered"].includes(r.status) && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {reviewState === "sent" || reviewState === "already" ? (
                <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                  {reviewState === "already"
                    ? "A review request was already sent to this client."
                    : `Review request sent to ${r.client_name.split(" ")[0]} ✓`}
                </p>
              ) : (
                <>
                  <button
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    onClick={requestReview}
                    disabled={reviewState === "sending" || !r.client_email}
                    title={
                      !r.client_email
                        ? "Add the client's email first"
                        : "Emails the client your Google review link — they just got covered, it's the perfect moment"
                    }
                  >
                    {reviewState === "sending" ? "Sending…" : "★ Ask for a Google review"}
                  </button>
                  {!r.client_email && (
                    <span className="text-[11px] text-ink-muted">needs the client&apos;s email</span>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* A realtor referral carries a second relationship the agent can't see
            from anywhere else: the loan officer on the same file. */}
        {partnerType === "realtor" && (
          <LenderLink
            referralId={r.id}
            realtorName={r.partners?.name ?? "your realtor"}
            clientFirst={r.client_name.split(" ")[0]}
            lender={r.deal_lender ?? null}
            covered={["bound", "docs_delivered"].includes(r.status)}
            hasDocs={r.documents.some((d) => ["eoi", "rce", "dec"].includes(d.kind) && !d.purged_at)}
            docsSentAt={r.lender_docs_sent_at ?? null}
            onSaved={load}
          />
        )}

        {/* The client half of the deal — quote out, check-in, welcome */}
        <ClientTrack
          referralId={r.id}
          clientName={r.client_name}
          clientEmail={r.client_email}
          partnerName={r.partners?.name ?? "your partner"}
          status={r.status}
          hasQuoteDoc={r.documents.some((d) => d.kind === "quote" && !d.purged_at)}
          hasEoi={hasEoi}
          quoteSentAt={r.quote_sent_at ?? null}
          welcomeSentAt={r.welcome_sent_at ?? null}
          nudgedAt={r.client_nudged_at ?? null}
          onDone={load}
        />

        {/* Quick touch log — one tap, lands on the timeline AND the partner's portal */}
        <section className="card p-5 space-y-2.5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="section-label">Log a touch</h2>
            <p className="text-[11px] text-ink-muted">
              Shows on {r.partners?.name ?? "your partner"}&apos;s portal as proof the file is being worked
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { t: "call", l: "Called client" },
              { t: "text", l: "Texted client" },
              { t: "email", l: "Emailed client" },
              { t: "voicemail", l: "Left voicemail" },
            ].map((b) => (
              <button
                key={b.t}
                className={`${touchDone === b.t ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
                onClick={() => logTouch(b.t)}
                disabled={touchBusy !== null}
              >
                {touchBusy === b.t ? "Logging…" : touchDone === b.t ? "Logged ✓" : b.l}
              </button>
            ))}
          </div>

          {/* Coverage record — one line until it's used. The timestamped proof
              that a recommendation was made, which is what an E&O carrier asks
              for and almost nobody keeps. */}
          {covEntries.length > 0 && (
            <ul className="pt-2 border-t border-slate-100 space-y-1">
              {covEntries.map((c: any, i: number) => (
                <li key={i} className="text-xs text-ink-secondary">
                  <span className="font-medium text-ink">{c.coverage}</span> —{" "}
                  {c.outcome === "declined" ? (
                    <span className="text-amber-700 font-medium">declined by client</span>
                  ) : c.outcome === "accepted" ? (
                    <span className="text-emerald-700 font-medium">accepted</span>
                  ) : (
                    "recommended"
                  )}
                  {c.note ? ` · ${c.note}` : ""}
                  <span className="text-ink-muted">
                    {" · "}
                    {new Date(c.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {covOpen ? (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  className="input !py-2 text-sm"
                  placeholder="Coverage (e.g. Flood)"
                  value={covName}
                  onChange={(e) => setCovName(e.target.value)}
                />
                <select className="input !py-2 text-sm" value={covOutcome} onChange={(e) => setCovOutcome(e.target.value)}>
                  <option value="declined">Client declined</option>
                  <option value="accepted">Client accepted</option>
                  <option value="pending">Recommended — awaiting</option>
                </select>
                <input
                  className="input !py-2 text-sm"
                  placeholder="Note (optional)"
                  value={covNote}
                  onChange={(e) => setCovNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={addCoverage}>
                  Record it
                </button>
                <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setCovOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="link !text-xs" onClick={() => setCovOpen(true)}>
              + Record a coverage recommendation or declination
            </button>
          )}
        </section>

        {/* Pre-delivery cross-check — the last set of eyes before the lender
            sees the policy. Only shown once there's something to check, and
            only on the lender track: there's no mortgagee clause or loan
            number on a referral a realtor sent. */}
        {fullTrack && r.documents.length > 0 && (
          <section
            className={`card p-5 space-y-3 ${
              check?.blockers > 0
                ? "border-red-300"
                : check && check.findings?.length === 0
                  ? "border-emerald-300"
                  : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <IconSparkles size={15} className="text-brand" /> Pre-delivery check
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Reads your EOI and RCE against the loan document, insurance request, and
                  mortgagee clause your partner sent — names, co-borrower, property address,
                  mortgagee wording, loan number, effective date, and Coverage A vs replacement
                  cost.
                </p>
              </div>
              <button
                className="btn-ghost !py-1.5 text-xs shrink-0"
                onClick={() => runCheck()}
                disabled={checking}
              >
                {checking ? "Reading documents…" : check ? "Re-check" : "Check the docs"}
              </button>
            </div>

            {checkError && <p className="text-xs text-amber-700">{checkError}</p>}

            {check && (
              <div className="space-y-2">
                {check.findings.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                    <p className="text-sm font-semibold text-emerald-800 inline-flex items-center gap-2">
                      <IconCheck size={15} /> Everything matches
                    </p>
                    <p className="text-xs text-ink-secondary mt-1">
                      Checked {check.checked.join(", ") || "the available fields"} against{" "}
                      {check.comparedAgainst.join(", ")}.
                      {check.unchecked?.length > 0 && (
                        <> Couldn&apos;t compare: {check.unchecked.join(", ")}.</>
                      )}
                    </p>
                  </div>
                ) : (
                  check.findings.map((f: any, i: number) => (
                    <div
                      key={i}
                      className={`rounded-xl border px-4 py-3 ${
                        f.severity === "blocker"
                          ? "border-red-200 bg-red-50/60"
                          : "border-amber-200 bg-amber-50/60"
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          f.severity === "blocker" ? "text-red-700" : "text-amber-800"
                        }`}
                      >
                        {f.severity === "blocker" ? "⛔" : "⚠️"} {f.issue}
                      </p>
                      {(f.on_agent_doc || f.on_lender_doc) && (
                        <p className="text-[11px] text-ink-secondary mt-1">
                          Your document: <span className="font-medium text-ink">{f.on_agent_doc ?? "—"}</span>
                          {" · "}Lender&apos;s: <span className="font-medium text-ink">{f.on_lender_doc ?? "—"}</span>
                        </p>
                      )}
                      {f.fix && <p className="text-xs text-ink-secondary mt-1.5">→ {f.fix}</p>}
                    </div>
                  ))
                )}
                <p className="text-[11px] text-ink-muted">
                  Checked {new Date(check.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  . Re-check after you re-issue anything — a second look costs nothing.
                </p>
              </div>
            )}
          </section>
        )}

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
                  <span className="flex items-center gap-3 shrink-0">
                    {d.purged_at ? (
                      <span className="text-[11px] text-ink-muted italic" title="Source file deleted for privacy — everything extracted from it is still on this deal">
                        source file removed
                      </span>
                    ) : (
                      <>
                        <button
                          className="link disabled:opacity-50"
                          onClick={() => extractDoc(d.id)}
                          disabled={extracting !== null}
                          title="AI reads this document and fills in any missing client or policy details"
                        >
                          <IconSparkles size={13} /> {extracting === d.id ? "Reading…" : "Extract"}
                        </button>
                        <a className="link" href={`/api/docs/${d.id}/download`} target="_blank">
                          <IconDownload size={13} /> Download
                        </a>
                        {SENSITIVE_DOC_KINDS.includes(d.kind) && (
                          <button
                            className="link !text-ink-muted hover:!text-brand"
                            onClick={() => purgeDoc(d.id, d.file_name)}
                            title="Delete the original file, keep everything extracted from it"
                          >
                            Keep details, drop file
                          </button>
                        )}
                      </>
                    )}
                    <button
                      className="text-ink-muted hover:text-red-600 transition-colors"
                      onClick={() => deleteDoc(d.id, d.file_name)}
                      title="Remove this document (wrong file? uploaded to the wrong deal?)"
                      aria-label={`Delete ${d.file_name}`}
                    >
                      <IconTrash size={13} />
                    </button>
                  </span>
                  {unlockFor === d.id && (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <p className="text-[11px] text-ink-secondary">
                        Lenders send protected files and the password separately. Paste it here — it
                        opens this document and is never stored.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          className="input !py-2 text-sm !w-auto flex-1 min-w-[180px]"
                          type="password"
                          placeholder="Password from the lender"
                          value={unlockPw}
                          onChange={(e) => setUnlockPw(e.target.value)}
                          autoFocus
                        />
                        <button
                          className="btn-primary !py-2 !px-3 text-xs shrink-0"
                          disabled={unlockBusy || !unlockPw}
                          onClick={() => unlockDoc(d.id)}
                        >
                          {unlockBusy ? "Opening…" : "Unlock & read"}
                        </button>
                      </div>
                      {unlockErr && <p className="text-xs text-red-600">{unlockErr}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {extractResult && (
            <div className="text-xs rounded-lg bg-brand-light/60 border border-brand-100 px-3 py-2.5 space-y-1">
              {extractResult.summary && (
                <p className="text-ink-secondary inline-flex items-center gap-1.5">
                  <IconFile size={12} className="shrink-0" /> {extractResult.summary}
                </p>
              )}
              {extractResult.filled.length > 0 ? (
                <p className="text-emerald-700 font-medium">✓ Filled: {extractResult.filled.join(", ")}</p>
              ) : (
                <p className="text-ink-muted">Nothing new to fill — existing info left untouched.</p>
              )}
              {extractResult.mismatches.map((m, i) => (
                <p key={i} className="text-amber-700 inline-flex items-center gap-1.5">
                  <IconAlert size={12} className="shrink-0" /> {m}
                </p>
              ))}
            </div>
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
            <IconUpload size={14} /> {uploading ? "Uploading…" : "Upload file"}
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
                  className="link"
                >
                  Show earlier messages ({msgs.length - 3})
                </button>
              )}
              {(showAllMsgs ? msgs : msgs.slice(-3)).map((m) => (
                <div
                  key={m.id}
                  className={`group text-sm rounded-xl px-3.5 py-2.5 max-w-[85%] ${
                    m.sender === "agent" ? "bg-brand-light ml-auto" : "bg-slate-100"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-0.5 flex items-center gap-2">
                    <span>
                      {m.sender === "agent" ? "You" : r.partners?.name ?? "Partner"} ·{" "}
                      {new Date(m.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      className="ml-auto text-ink-muted/60 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      onClick={() => deleteMsg(m.id)}
                      title="Remove this message"
                      aria-label="Delete message"
                    >
                      <IconTrash size={12} />
                    </button>
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
            <button
              type="button"
              onClick={draftReply}
              disabled={drafting}
              className="btn-ghost shrink-0"
              title="Draft an update from this deal's real status and activity — you edit before sending"
            >
              <IconSparkles size={14} /> {drafting ? "…" : "Draft"}
            </button>
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
                className="link"
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
          <button onClick={del} className="link-muted hover:!text-red-600">
            <IconTrash size={13} /> Delete referral
          </button>
          <a href={`/deal/${id}/file`} className="link !text-xs" target="_blank" rel="noopener">
            Print the full deal file
          </a>
        </div>

        {/* The gate. Triggered by marking docs delivered when the check found
            something — the one moment where catching it still costs nothing. */}
        {gate && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="card p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-red-700">
                Hold on — before this goes to your partner
              </p>
              <h3 className="text-lg font-bold tracking-tight mt-1">
                {gate.blockers > 0
                  ? `${gate.blockers} thing${gate.blockers === 1 ? "" : "s"} the lender will bounce`
                  : `${gate.warnings} thing${gate.warnings === 1 ? "" : "s"} worth a look`}
              </h3>
              <p className="text-sm text-ink-secondary mt-1.5">
                Marking this delivered emails {r.partners?.name ?? "your partner"} that the
                documents are ready. Fixing it now is a re-upload; fixing it later is a phone call
                during someone&apos;s closing week.
              </p>
              <div className="space-y-2 mt-4">
                {gate.findings.map((f: any, i: number) => (
                  <div
                    key={i}
                    className={`rounded-xl border px-4 py-3 ${
                      f.severity === "blocker" ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">
                      {f.severity === "blocker" ? "⛔" : "⚠️"} {f.issue}
                    </p>
                    {f.fix && <p className="text-xs text-ink-secondary mt-1">→ {f.fix}</p>}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-5 flex-wrap">
                <button className="btn-primary !py-2 text-xs" onClick={() => setGate(null)}>
                  Let me fix it
                </button>
                <button
                  className="btn-ghost !py-2 text-xs"
                  onClick={async () => {
                    const g = gate;
                    setGate(null);
                    setCheck({ ...g, overridden: true, findings: [] });
                    await setStatus("docs_delivered");
                  }}
                >
                  I checked — send anyway
                </button>
              </div>
              <p className="text-[11px] text-ink-muted mt-3">
                AI reads documents well but not perfectly. If it flagged something that&apos;s
                actually fine, send anyway — you know the file.
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
