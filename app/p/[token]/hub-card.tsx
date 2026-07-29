"use client";

import { useState } from "react";
import { IconMail } from "../../icons";

// Portal-side entry to the lender workspace: they enter their email, the
// board link goes to that inbox (never shown on screen — delivery IS the
// ownership check).

export function HubCard() {
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

  return (
    <div className="card p-5">
      <p className="font-semibold text-sm">Work with more than one insurance agent?</p>
      <p className="text-xs text-ink-secondary mt-1">
        Get your <span className="font-medium text-ink">referral board</span> — every agent, every
        client you&apos;ve sent, one live page. We&apos;ll email your private link.
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
          />
          <button className="btn-primary !py-2 text-xs shrink-0" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me my board"}
          </button>
          {error && <p className="text-xs text-red-600 w-full">{error}</p>}
        </form>
      )}
    </div>
  );
}
