"use client";

import { useEffect, useState } from "react";
import { IconMail } from "../../icons";

// Optional lender workspace entry — a quiet one-liner, not a billboard.
// Partners who already have tooling they love can ignore it forever; the
// portal works exactly the same either way. Expands to the email form only
// if they're curious. The board link goes to their inbox (never shown on
// screen — delivery IS the ownership check).

export function HubCard({ weight = 0 }: { weight?: number }) {
  // Earned prominence: a partner with several referrals on this portal has
  // shown the tool matters to them, so the combined board gets a real card
  // instead of a one-line whisper. Still dismissible, still never forced —
  // and dismissing it is remembered.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem("rb_hub_dismissed") === "1");
    } catch {}
  }, []);
  const earned = weight >= 3 && !dismissed;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const res = await fetch("/api/hub/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setState("sent");
    } else {
      setState("idle");
      setError((await res.json()).error ?? "Something went wrong — try again");
    }
  }

  if (!open && state !== "sent") {
    if (!earned) {
      return (
        <p className="text-center text-xs text-ink-muted">
          Work with more than one insurance agent?{" "}
          <button type="button" className="link !text-xs" onClick={() => setOpen(true)}>
            Get an optional combined view
          </button>
        </p>
      );
    }
    return (
      <div className="card p-5 border-brand-200 bg-brand-light/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">One board for every insurance agent you use</p>
            <p className="text-xs text-ink-secondary mt-1 max-w-md">
              You&apos;ve got {weight} files on this portal. If you work with other insurance
              agents too, your referral board puts all of them on one page — every client, every
              closing date, one link. Free, and this portal keeps working exactly the same either
              way.
            </p>
            <button type="button" className="btn-primary !py-1.5 text-xs mt-3" onClick={() => setOpen(true)}>
              <IconMail size={13} /> Email me my board
            </button>
          </div>
          <button
            type="button"
            className="text-ink-muted hover:text-ink text-xs shrink-0"
            onClick={() => {
              setDismissed(true);
              try {
                window.localStorage.setItem("rb_hub_dismissed", "1");
              } catch {}
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <p className="font-semibold text-sm">Your referral board — optional, and free</p>
      <p className="text-xs text-ink-secondary mt-1">
        One live page combining every ReferBound agent you work with. Purely a complement to
        whatever you already use — this portal keeps working exactly the same either way. We&apos;ll
        email your private link.
      </p>
      {state === "sent" ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-3 inline-flex items-center gap-1.5">
          <IconMail size={13} /> Check your inbox — if that email is on any portals, your board link
          is on its way.
        </p>
      ) : (
        <form onSubmit={request} className="flex items-center gap-2 mt-3 flex-wrap">
          <input
            className="input !w-auto flex-1 min-w-[220px] !py-2 text-sm"
            type="email"
            inputMode="email"
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <button className="btn-primary !py-2 text-xs shrink-0" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me my board"}
          </button>
          <button
            type="button"
            className="btn-ghost !py-2 text-xs shrink-0"
            onClick={() => setOpen(false)}
          >
            No thanks
          </button>
          {error && <p className="text-xs text-red-600 w-full">{error}</p>}
        </form>
      )}
    </div>
  );
}
