"use client";

import { useState } from "react";
import { IconMail, IconCheck } from "./icons";

// "Email the link" — AI drafts a warm portal introduction, the agent edits,
// then sends it from ReferBound (to the partner's notification emails) or
// opens it in their own mail app. Answers the pilot question "does an email
// go out when I copy the link?" with a real send button.

export function PartnerInviteButton({
  partnerId,
  partnerName,
  className = "btn-ghost !px-3 !py-1.5 text-xs",
}: {
  partnerId: string;
  partnerName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [state, setState] = useState<"edit" | "sending" | "sent">("edit");
  const [error, setError] = useState("");

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setState("edit");
    setError("");
    const res = await fetch(`/api/partners/${partnerId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft" }),
    });
    setLoading(false);
    if (res.ok) {
      const d = await res.json();
      setSubject(d.subject);
      setBody(d.body);
      setRecipients(d.recipients ?? []);
    } else {
      setError((await res.json()).error ?? "Couldn't draft the email");
    }
  }

  async function send() {
    setState("sending");
    setError("");
    const res = await fetch(`/api/partners/${partnerId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", subject, body }),
    });
    if (res.ok) {
      setState("sent");
      setTimeout(() => setOpen(false), 2000);
    } else {
      setState("edit");
      setError((await res.json()).error ?? "Couldn't send");
    }
  }

  const [copied, setCopied] = useState(false);
  const mailto = `mailto:${recipients.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // Gmail web compose — works for browser-Gmail users where mailto: silently
  // does nothing (no default desktop mail app configured).
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipients.join(","))}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function copyEmail() {
    await navigator.clipboard.writeText(`To: ${recipients.join(", ")}\nSubject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button type="button" className={className} onClick={openModal}>
        <IconMail size={12} /> Email the link
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card p-5 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            {loading ? (
              <p className="text-sm text-ink-muted text-center py-8">Drafting the introduction…</p>
            ) : state === "sent" ? (
              <p className="text-sm text-emerald-700 font-medium text-center py-8 inline-flex items-center gap-2 w-full justify-center">
                <IconCheck size={16} /> Sent to {recipients.join(", ")}
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">Introduce {partnerName} to their portal</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Edit anything, then send{recipients.length > 0 ? ` to ${recipients.join(", ")}` : ""}.
                  </p>
                </div>
                <input className="input text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <textarea
                  className="input !h-52 text-sm resize-y"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="btn-primary !py-2 text-xs"
                    onClick={send}
                    disabled={state === "sending" || recipients.length === 0}
                    title={recipients.length === 0 ? "Add a notification email to this partner first" : undefined}
                  >
                    {state === "sending" ? "Sending…" : "Send from ReferBound"}
                  </button>
                  <a href={gmail} target="_blank" rel="noopener" className="btn-ghost !py-2 text-xs">
                    Open in Gmail
                  </a>
                  <button className="btn-ghost !py-2 text-xs" onClick={copyEmail}>
                    {copied ? "Copied ✓" : "Copy email"}
                  </button>
                  <button className="btn-ghost !py-2 text-xs" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-ink-muted">
                  Use a desktop mail app instead?{" "}
                  <a href={mailto} className="link !text-[11px]">
                    Open in mail app
                  </a>{" "}
                  (needs a default mail app set in Windows/Mac).
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
