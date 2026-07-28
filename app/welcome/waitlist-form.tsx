"use client";

import { useState } from "react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "landing" }),
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError((await res.json()).error ?? "Something went wrong — try again.");
  }

  if (done) {
    return (
      <p className="card px-6 py-4 text-sm font-semibold text-emerald-700">
        You&apos;re on the list ✓ — we&apos;ll reach out when your spot opens.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="email"
        required
        className="input"
        placeholder="you@youragency.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn-primary shrink-0" disabled={busy || !email}>
        {busy ? "…" : "Get early access"}
      </button>
      {error && <p className="text-xs text-red-600 self-center">{error}</p>}
    </form>
  );
}
