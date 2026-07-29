"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../components";

export default function ForgotPage() {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    setStep("reset");
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/login");
    } else {
      setError((await res.json()).error ?? "Reset failed");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Wordmark size="text-2xl" />
          <p className="text-sm text-ink-secondary mt-2">Reset your password</p>
        </div>
        {step === "request" ? (
          <form onSubmit={requestCode} className="card p-6 space-y-4">
            <label className="block">
              <span className="section-label">Email</span>
              <input
                type="email"
                className="input mt-1.5"
                placeholder="you@youragency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </label>
            <button className="btn-primary w-full" disabled={busy || !email}>
              {busy ? "Sending…" : "Email me a reset code"}
            </button>
            <p className="text-xs text-ink-muted text-center">
              <Link href="/login" className="link !text-xs">Back to sign in</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={reset} className="card p-6 space-y-4">
            <p className="text-xs text-ink-secondary">
              If an account exists for {email}, a 6-digit code is on its way. Enter it with your new
              password.
            </p>
            <input
              className="input tracking-[0.3em] text-center font-semibold"
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
            <input
              type="password"
              className="input"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
              {busy ? "Resetting…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
