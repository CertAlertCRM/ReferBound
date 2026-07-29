"use client";

import { useState } from "react";
import { IconMail } from "../../icons";

// Optional lender workspace entry — a quiet one-liner, not a billboard.
// Partners who already have tooling they love can ignore it forever; the
// portal works exactly the same either way. Expands to the email form only
// if they're curious. The board link goes to their inbox (never shown on
// screen — delivery IS the ownership check).

export function HubCard() {
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
