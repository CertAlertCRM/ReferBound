"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconMessage } from "../../icons";

type Msg = { id: string; sender: string; body: string; created_at: string };

export function ReferralMessages({
  token,
  referralId,
  messages,
  agentName,
  partnerName,
}: {
  token: string;
  referralId: string;
  messages: Msg[];
  agentName: string;
  partnerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/p/${token}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: referralId, body }),
    });
    setBusy(false);
    if (res.ok) {
      setBody("");
      router.refresh();
    } else {
      alert((await res.json()).error ?? "Couldn't send — try again");
    }
  }

  return (
    <div className="mt-3.5 border-t border-slate-100 pt-3">
      <button onClick={() => setOpen(!open)} className="link">
        <IconMessage size={13} />
        {open ? "Hide messages" : messages.length > 0 ? `Messages (${messages.length})` : "Ask about this referral"}
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm rounded-xl px-3.5 py-2.5 max-w-[85%] ${
                m.sender === "partner"
                  ? "bg-brand-light text-ink ml-auto"
                  : "bg-slate-100 text-ink"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-0.5">
                {m.sender === "partner" ? partnerName : agentName} ·{" "}
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
          <form onSubmit={send} className="flex gap-2">
            <input
              className="input"
              placeholder={`Message ${agentName}…`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
            />
            <button className="btn-primary shrink-0 !px-3 !py-1.5 text-xs" disabled={busy || !body.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </form>
          <p className="text-[10px] text-ink-muted">
            {agentName} is notified instantly and replies land here and in your inbox.
          </p>
        </div>
      )}
    </div>
  );
}
