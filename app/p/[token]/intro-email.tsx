"use client";

import { useState } from "react";
import { IconMail, IconSparkles, IconCopy, IconCheck } from "../../icons";

// The partner's intro-email composer: AI drafts (following their saved
// template if one exists), they edit, then it opens in THEIR email app via
// mailto — the intro always comes from the partner's own address.

export function IntroEmail({
  token,
  referralId,
  clientName,
}: {
  token: string;
  referralId: string;
  clientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [hasTemplate, setHasTemplate] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function loadDraft() {
    setOpen(true);
    setLoading(true);
    setNote(null);
    const res = await fetch(`/api/p/${token}/intro-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: referralId }),
    });
    setLoading(false);
    if (!res.ok) {
      setNote("Couldn't draft right now — try again in a moment.");
      return;
    }
    const d = await res.json();
    setSubject(d.subject ?? "");
    setBody(d.body ?? "");
    setAgentEmail(d.agentEmail ?? "");
    setClientEmail(d.clientEmail ?? null);
    setHasTemplate(!!d.hasTemplate);
  }

  function mailtoHref() {
    const to = clientEmail || agentEmail;
    const cc = clientEmail && agentEmail ? agentEmail : "";
    return `mailto:${encodeURIComponent(to)}${cc ? `?cc=${encodeURIComponent(cc)}&` : "?"}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function copyAll() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setNote("Copied ✓ — paste into any email.");
  }

  async function saveTemplate() {
    const res = await fetch(`/api/p/${token}/template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: body }),
    });
    if (res.ok) {
      setHasTemplate(true);
      setNote("Saved as your template ✓ — future drafts will follow this pattern with each new client's details.");
    } else {
      setNote("Couldn't save the template — try again.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={loadDraft}
        className="link"
        title="AI drafts the introduction email connecting your client with the agent — it opens in your own email app to send"
      >
        <IconMail size={13} /> Intro email
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-light/40 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-brand-800">
          Introduction email for {clientName}
          {hasTemplate && <span className="text-ink-muted font-normal"> · following your saved template</span>}
        </p>
        <button className="text-xs text-ink-muted hover:text-ink" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted py-3 inline-flex items-center gap-1.5">
          <IconSparkles size={14} /> Drafting…
        </p>
      ) : (
        <>
          <input
            className="input text-sm"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <textarea
            className="input text-sm min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <a href={mailtoHref()} className="btn-primary !px-3 !py-1.5 text-xs">
              <IconMail size={13} /> Open in my email
            </a>
            <button type="button" onClick={copyAll} className="btn-ghost !px-3 !py-1.5 text-xs">
              <IconCopy size={13} /> Copy
            </button>
            <button
              type="button"
              onClick={saveTemplate}
              className="link ml-auto"
              title="Save this wording as your pattern — future drafts keep your style and just swap the client details"
            >
              <IconCheck size={13} /> {hasTemplate ? "Update my template" : "Save as my template"}
            </button>
          </div>
          <p className="text-[10px] text-ink-muted">
            Opens in your own email app addressed to{" "}
            {clientEmail ? "your client (agent cc'd)" : "the agent — add your client's address before sending"}. Edit
            anything first; it sends from you, not from ReferBound.
          </p>
          {note && <p className="text-xs text-emerald-700">{note}</p>}
        </>
      )}
    </div>
  );
}
