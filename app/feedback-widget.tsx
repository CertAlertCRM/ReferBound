"use client";

import { useState } from "react";
import { IconMessage, IconX } from "./icons";

// Floating feedback pill — bottom-right on every agent page and partner
// portal. Suggestions go straight to the founder's inbox.

export function FeedbackWidget({ source, context }: { source: "agent" | "partner"; context?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, source, context }),
    });
    if (res.ok) {
      setState("sent");
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setState("idle");
      }, 2200);
    } else {
      setState("idle");
      setError((await res.json()).error ?? "Couldn't send — try again");
    }
  }

  return (
    // `feedback-float` lets globals.css lift this above the mobile tab bar on
    // agent pages (body.has-bottomnav). Portals have no tab bar and stay put.
    <div className="feedback-float fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div className="card p-4 w-72 shadow-lift">
          {state === "sent" ? (
            <p className="text-sm text-emerald-700 font-medium">
              Got it — thank you. Every note gets read.
            </p>
          ) : (
            <form onSubmit={send} className="space-y-2.5">
              <p className="text-sm font-semibold">What should we improve?</p>
              <textarea
                className="input !h-24 resize-none text-sm"
                placeholder="A bug, an idea, something confusing…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                autoFocus
                required
                minLength={3}
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button className="btn-primary w-full !py-2 text-xs" disabled={state === "sending"}>
                {state === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 shadow-card hover:shadow-lift px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:text-ink transition-all"
        aria-label={open ? "Close feedback" : "Send feedback"}
      >
        {open ? <IconX size={13} /> : <IconMessage size={13} />}
        {open ? "Close" : "Feedback"}
      </button>
    </div>
  );
}
