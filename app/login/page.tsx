"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "../components";

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setBusy(false);
    if (res.ok) router.push("/");
    else setError("That passcode didn't match — try again.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Wordmark size="text-2xl" />
          <p className="text-sm text-ink-secondary mt-2">Live referral tracking for you and your partners</p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <label className="block">
            <span className="section-label">Agent passcode</span>
            <input
              type="password"
              className="input mt-1.5"
              placeholder="••••••••"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !passcode}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
