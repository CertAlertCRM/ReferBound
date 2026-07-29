"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../components";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: name, email, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/profile");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Signup failed");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Wordmark size="text-2xl" />
          <p className="text-sm text-ink-secondary mt-2">
            Create your account — free for your first partner
          </p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <label className="block">
            <span className="section-label">Your name</span>
            <input
              className="input mt-1.5"
              placeholder="David Falden"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="section-label">Email</span>
            <input
              type="email"
              inputMode="email"
              className="input mt-1.5"
              placeholder="you@youragency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="section-label">Password</span>
            <input
              type="password"
              className="input mt-1.5"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
          <p className="text-xs text-ink-muted text-center">
            Already have one?{" "}
            <Link href="/login" className="link !text-xs">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
