"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../../components";
import { IconCheck, IconUsers, IconArrowRight } from "../../icons";

// Accepting a shared partner setup.
//
// Public on purpose: an agent who doesn't have an account yet should be able to
// see what they're being handed before signing up for anything. The preview is
// deliberately honest about what this is and isn't — nobody should click
// through thinking they've just been given referrals.

export default function SharePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => setSignedIn(r.ok));
  }, []);

  async function accept() {
    setState("working");
    const res = await fetch("/api/share", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      const j = await res.json();
      setAdded(j.name ?? "the partner");
      setState("done");
      setTimeout(() => router.push(`/partner/${j.partner_id}`), 1400);
    } else {
      setMessage((await res.json()).error ?? "Couldn't add that partner");
      setState("error");
    }
  }

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="flex justify-center">
          <Wordmark />
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-brand-light text-brand grid place-items-center shrink-0">
              <IconUsers size={18} />
            </span>
            <div>
              <h1 className="font-bold tracking-tight">A partner setup was shared with you</h1>
              <p className="text-xs text-ink-muted">from another ReferBound agent</p>
            </div>
          </div>

          <p className="text-sm text-ink-secondary">
            Accepting copies the company, their team contacts, and their requirements — the
            mortgagee clause, deductible limits, everything someone already typed once — into your
            account, with your own portal link.
          </p>

          <div className="rounded-xl bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-900 font-semibold">This is a shortcut, not a referral</p>
            <p className="text-xs text-amber-800 mt-1">
              It saves you the setup. It does not mean this lender is sending you business — that
              part is still a conversation you have with them. No clients, deals, or history come
              across.
            </p>
          </div>

          {state === "done" ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5 inline-flex items-center gap-2">
              <IconCheck size={15} /> {added} added — opening it now
            </p>
          ) : signedIn === false ? (
            <div className="space-y-2">
              <Link href={`/signup?next=/share/${code}`} className="btn-primary w-full justify-center">
                Create a free account to accept <IconArrowRight size={14} />
              </Link>
              <Link
                href={`/login?next=/share/${code}`}
                className="btn-ghost w-full justify-center text-sm"
              >
                I already have an account
              </Link>
            </div>
          ) : (
            <button
              className="btn-primary w-full justify-center"
              onClick={accept}
              disabled={state === "working" || signedIn === null}
            >
              {state === "working" ? "Adding…" : "Add this partner to my account"}
            </button>
          )}

          {state === "error" && <p className="text-xs text-red-600">{message}</p>}
        </div>

        <p className="text-center text-[11px] text-ink-muted">
          Nothing is shared back — the agent who sent this can&apos;t see your clients or your board.
        </p>
      </div>
    </main>
  );
}
