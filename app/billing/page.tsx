"use client";

import { useEffect, useState } from "react";
import { TopNav } from "../components";
import { IconCheck, IconExternal, IconUsers } from "../icons";
import { ReferCard } from "../refer-card";
import { SkeletonPanels } from "../skeleton";

type Billing = {
  plan: string;
  planLabel: string;
  email: string;
  subscriptionStatus: string | null;
  managed: boolean;
  ownerEmail: string | null;
  billingInterval: "monthly" | "annual";
  earnedPro?: boolean;
  proUntil?: string | null;
  links: { pro: string | null; agency: string | null; founder: string | null; portal: string | null };
};

const TIERS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "1 lender partner — the full pipeline",
      "Plus 2 other referral partners (realtors, CPAs, friends)",
      "Live portals, documents, messages & alerts",
      "AI intake, extraction & intro emails",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$20",
    period: "per month",
    features: [
      "Unlimited lenders and referral partners",
      "Everything in Free",
      "Premium & ROI tracking",
      "Monthly partner summaries",
    ],
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
          <SkeletonPanels count={3} />
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
            {billing.billingInterval === "annual" && !billing.earnedPro && (
              <span> — Founding Member, $199/year</span>
            )}
            {billing.earnedPro && billing.proUntil && (
              <span>
                {" "}
                — earned through referrals, through{" "}
                {new Date(billing.proUntil).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {billing.subscriptionStatus === "past_due" && (
              <span className="text-red-600"> — payment past due</span>
            )}
            .
          </p>
        </div>

        {/* Founding-member annual offer. Shown to free accounts only — an
            existing monthly subscriber switching via a Payment Link would
            create a second subscription, so they go through the Stripe
            billing portal instead. */}
        {billing.plan === "free" && billing.links.founder && (
          <div className="card p-5 border-amber-300 ring-1 ring-amber-200 bg-gradient-to-r from-amber-50/70 to-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                  Founding member offer
                </p>
                <p className="font-bold mt-1">
                  Pro for <span className="text-xl tracking-tight">$199</span>
                  <span className="text-sm font-semibold">/year</span>{" "}
                  <span className="text-sm font-normal text-ink-secondary">
                    — over two months free vs $20/mo
                  </span>
                </p>
                <p className="text-xs text-ink-secondary mt-1">
                  Everything in Pro, at the founding rate. Your price stays $199/yr for as long as
                  you keep the plan — even after public pricing goes up.
                </p>
              </div>
              <a href={billing.links.founder} className="btn-primary whitespace-nowrap shrink-0">
                Become a founding member
              </a>
            </div>
          </div>
        )}

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

        <ReferCard />

        <p className="text-xs text-ink-muted">
          Payments are processed by Stripe. Plans activate automatically within a minute of checkout —
          refresh this page after upgrading.
        </p>
      </main>
    </>
  );
}
