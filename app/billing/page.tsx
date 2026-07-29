"use client";

import { useEffect, useState } from "react";
import { TopNav } from "../components";
import { IconCheck, IconExternal, IconUsers } from "../icons";

type Billing = {
  plan: string;
  planLabel: string;
  email: string;
  subscriptionStatus: string | null;
  managed: boolean;
  ownerEmail: string | null;
  links: { pro: string | null; agency: string | null; portal: string | null };
};

const TIERS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["1 referral partner", "Full live portal for that partner", "Documents, messages & alerts", "AI intake, extraction & intro emails"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$20",
    period: "per month",
    features: ["Unlimited referral partners", "Everything in Free", "Premium & ROI tracking", "Monthly partner summaries"],
  },
  {
    key: "agency",
    name: "Agency",
    price: "$99",
    period: "per month",
    features: ["Everything in Pro", "One agency, up to 7 users", "Shared partner pool", "Invite teammates right from this page"],
  },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);

  useEffect(() => {
    fetch("/api/billing").then(async (r) => r.ok && setBilling(await r.json()));
  }, []);

  if (!billing) {
    return (
      <>
        <TopNav active="billing" />
        <main className="max-w-3xl mx-auto p-6">
          <div className="card p-10 text-center text-ink-muted">Loading…</div>
        </main>
      </>
    );
  }

  // ── Team member: plan is managed by the agency owner ─────────────────────
  if (billing.managed) {
    return (
      <>
        <TopNav active="billing" />
        <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Plan & billing</h1>
            <p className="text-sm text-ink-secondary mt-1">
              You&apos;re on your agency&apos;s <span className="font-semibold">{billing.planLabel}</span> plan.
            </p>
          </div>
          <div className="card p-6 flex items-start gap-3">
            <IconUsers size={18} className="text-brand mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Billing is handled by your agency owner</p>
              <p className="text-sm text-ink-secondary mt-1">
                Your seat is part of the Agency plan managed by{" "}
                <span className="font-medium text-ink">{billing.ownerEmail}</span>. Plan changes,
                payment, and invoices all live with them — nothing for you to do here.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const linkFor = (key: string) =>
    key === "pro" ? billing.links.pro : key === "agency" ? billing.links.agency : null;

  return (
    <>
      <TopNav active="billing" />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Plan & billing</h1>
          <p className="text-sm text-ink-secondary mt-1">
            You&apos;re on the <span className="font-semibold">{billing.planLabel}</span> plan
            {billing.subscriptionStatus === "past_due" && (
              <span className="text-red-600"> — payment past due</span>
            )}
            .
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TIERS.map((t) => {
            const current = billing.plan === t.key;
            const link = linkFor(t.key);
            return (
              <div
                key={t.key}
                className={`card p-5 flex flex-col ${current ? "border-brand ring-1 ring-brand/30" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">{t.name}</h2>
                  {current && <span className="badge bg-brand-light text-brand-700">Current</span>}
                </div>
                <p className="mt-2">
                  <span className="text-2xl font-bold tracking-tight">{t.price}</span>{" "}
                  <span className="text-xs text-ink-muted">{t.period}</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-xs text-ink-secondary flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <IconCheck size={12} className="text-emerald-600 mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {current ? (
                    <button className="btn-ghost w-full" disabled>
                      Your plan
                    </button>
                  ) : t.key === "free" ? (
                    <button className="btn-ghost w-full" disabled title="Downgrades happen automatically if a subscription ends">
                      Included
                    </button>
                  ) : link ? (
                    <a href={link} className="btn-primary w-full">
                      Upgrade to {t.name}
                    </a>
                  ) : (
                    <button className="btn-ghost w-full" disabled title="Checkout link not configured yet">
                      Coming soon
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {billing.plan === "agency" && (
          <div className="card p-5 flex items-start gap-3">
            <IconUsers size={16} className="text-brand mt-0.5 shrink-0" />
            <p className="text-sm text-ink-secondary">
              Invite teammates and manage your seats from{" "}
              <a href="/profile" className="link !text-sm">
                your profile page
              </a>
              .
            </p>
          </div>
        )}

        {billing.links.portal && billing.plan !== "free" && (
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Manage your subscription</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Update card, view invoices, or cancel — handled securely by Stripe.
              </p>
            </div>
            <a href={billing.links.portal} target="_blank" className="btn-ghost">
              <IconExternal size={13} /> Open billing portal
            </a>
          </div>
        )}

        <p className="text-xs text-ink-muted">
          Payments are processed by Stripe. Plans activate automatically within a minute of checkout —
          refresh this page after upgrading.
        </p>
      </main>
    </>
  );
}
