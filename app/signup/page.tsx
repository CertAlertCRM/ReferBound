"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../components";
import { IconUsers } from "../icons";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setInvite(q.get("invite") ?? "");
    setRef(q.get("ref") ?? "");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: name, email, password, invite_code: invite || undefined, ref: ref || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      const { teamMember } = await res.json();
      // Teammates land on the shared dashboard; new owners start at their profile.
      router.push(teamMember ? "/" : "/profile");
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
            {invite ? "Join your agency's team" : "Create your account — free for your first partner"}
          </p>
        </div>
        {ref && !invite && (
          <div className="card px-4 py-3 mb-4 bg-brand-light/60 border-brand-200">
            <p className="text-xs text-brand-800">
              <span className="font-semibold">An agent sent you here</span> — your first month of
              Pro is on the house, so you can set up every referral partner you work with right
              away, not just one.
            </p>
          </div>
        )}
        {invite && (
          <div className="card px-4 py-3 mb-4 flex items-center gap-2.5 bg-brand-light/60 border-brand-200">
            <IconUsers size={16} className="text-brand-700 shrink-0" />
            <p className="text-xs text-brand-800">
              You&apos;ve been invited to an agency team — create your login and you&apos;ll see the
              shared partners and referrals right away.
            </p>
          </div>
        )}
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
            {busy ? "Creating account…" : invite ? "Join the team" : "Create account"}
          </button>
          <p className="text-[11px] text-ink-muted text-center">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="link !text-[11px]">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="link !text-[11px]">Privacy Policy</Link>.
          </p>
          <p className="text-xs text-ink-muted text-center">
            Already have one?{" "}
            <Link href="/login" className="link !text-xs">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
