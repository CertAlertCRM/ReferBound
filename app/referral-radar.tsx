"use client";

import { useEffect, useState } from "react";
import { IconPlus, IconX, IconArrowRight, IconSparkles } from "./icons";
import { PARTNER_TYPES } from "@/lib/config";

// Referral Radar — the mirror, not a megaphone. It shows agents where their
// referrals actually come from and who they've already worked with but never
// set up as a partner. Every number here is their own; no benchmarks, no
// claims about what more partners will do for them.

type Prospect = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  nmls: string | null;
  partner_type: string;
  source: string;
  status: string;
  notes: string | null;
  deal_count: number;
  suggested_partner_id: string | null;
  suggestedPartnerName: string | null;
};

type Radar = {
  partnerCount: number;
  limit: number | null;
  plan: string;
  total: number;
  topName: string | null;
  topShare: number;
  partnersWithReferrals: number;
  prospects: Prospect[];
  statuses: Record<string, string>;
};

export function ReferralRadar({ onConvert }: { onConvert: (p: Prospect) => void }) {
  const [d, setD] = useState<Radar | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", partner_type: "lender" });

  async function load() {
    const r = await fetch("/api/radar");
    if (r.ok) setD(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: string) {
    await fetch("/api/radar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  async function dismiss(id: string) {
    await fetch(`/api/radar?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function addProspect() {
    if (!form.name.trim() && !form.company.trim()) return;
    await fetch("/api/radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", company: "", email: "", phone: "", partner_type: "lender" });
    setAdding(false);
    load();
  }

  if (!d) return null;

  const radarFinds = d.prospects.filter((p) => p.source === "radar");
  const contactGaps = d.prospects.filter((p) => p.source === "contact");
  const pipeline = d.prospects.filter((p) => p.source === "manual");

  // One click: add this person to the partner team they already work on, so
  // their leads get attributed and their updates start flowing.
  async function addAsContact(p: Prospect) {
    if (!p.suggested_partner_id) return;
    const res = await fetch(`/api/partners/${p.suggested_partner_id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        email: p.email ?? "",
        phone: p.phone ?? "",
        sms_opt_in: false,
      }),
    });
    if (res.ok) {
      await fetch(`/api/radar?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      load();
    } else {
      alert((await res.json()).error ?? "Couldn't add — they may need an email address first.");
    }
  }

  // Honest read of their own distribution — never a promise about outcomes.
  const insight = (() => {
    if (d.total === 0) return null;
    if (d.partnersWithReferrals === 1) {
      return {
        tone: "amber" as const,
        headline: `Every referral you've logged came from ${d.topName}.`,
        body: "That's a great relationship — and right now it's also your only one. A second active partner is what turns a single thread into a pipeline.",
      };
    }
    if (d.topShare >= 60) {
      return {
        tone: "amber" as const,
        headline: `${d.topShare}% of your referrals come from ${d.topName}.`,
        body: `You're working ${d.partnersWithReferrals} partners, but the flow leans hard on one. If that desk gets quiet for a quarter, your pipeline feels it.`,
      };
    }
    return {
      tone: "emerald" as const,
      headline: `Well spread — your top partner is ${d.topShare}% of referrals.`,
      body: `${d.partnersWithReferrals} partners are actively sending you work. That's a durable book.`,
    };
  })();

  return (
    <section className="card p-5 space-y-4">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <IconSparkles size={15} className="text-brand" />
          <span className="font-semibold">Referral Radar</span>
          {radarFinds.length + contactGaps.length > 0 && (
            <span className="badge bg-brand-light text-brand-700">
              {radarFinds.length + contactGaps.length} to review
            </span>
          )}
        </span>
        <span className="link !text-xs">{open ? "Hide" : "Open"}</span>
      </button>

      {insight && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            insight.tone === "amber"
              ? "border-amber-400 bg-amber-100"
              : "border-emerald-400 bg-emerald-100"
          }`}
        >
          <p className="text-sm font-semibold text-ink">{insight.headline}</p>
          <p className="text-xs text-ink mt-1 leading-relaxed opacity-80">{insight.body}</p>
        </div>
      )}

      {open && (
        <>
          {/* Gap 1: people they demonstrably work with, with no portal yet */}
          <div>
            <h3 className="section-label mb-2">Working with you, no portal yet</h3>
            {radarFinds.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Every 1003 you run through AI names the loan officer who sent it. When that
                company isn&apos;t one of your partners yet, they show up here — you&apos;re
                already working together, they just don&apos;t have a portal.
              </p>
            ) : (
              <ul className="space-y-2">
                {radarFinds.map((p) => (
                  <li key={p.id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {p.company ?? p.name}
                          {p.name && p.company && <span className="text-ink-muted font-normal"> · {p.name}</span>}
                        </p>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          {p.deal_count === 1
                            ? "1 deal in your files — no portal yet"
                            : `${p.deal_count} deals in your files — no portal yet`}
                          {p.email && ` · ${p.email}`}
                        </p>
                      </div>
                      <span className="flex items-center gap-2 shrink-0">
                        <button type="button" className="link !text-xs whitespace-nowrap" onClick={() => onConvert(p)}>
                          Give them a portal <IconArrowRight size={11} />
                        </button>
                        <button
                          type="button"
                          className="text-ink-muted hover:text-red-600"
                          title="Not a fit — hide this"
                          onClick={() => dismiss(p.id)}
                        >
                          <IconX size={13} />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Gap 2: individuals missing from a partner team they belong to */}
          {contactGaps.length > 0 && (
            <div>
              <h3 className="section-label mb-2">Missing from a partner&apos;s team</h3>
              <p className="text-[11px] text-ink-muted -mt-1 mb-2">
                They sent you these deals, but they&apos;re not on the team list — so their leads
                aren&apos;t attributed to them and none of the updates reach them.
              </p>
              <ul className="space-y-2">
                {contactGaps.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-amber-400 bg-amber-100 px-3.5 py-2.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {p.name}
                        <span className="text-ink-muted font-normal"> at {p.suggestedPartnerName}</span>
                      </p>
                      <p className="text-[11px] text-ink-secondary mt-0.5">
                        {p.deal_count === 1 ? "1 deal" : `${p.deal_count} deals`} sent
                        {p.email ? ` · ${p.email}` : " · no email found — add it after"}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="link !text-xs whitespace-nowrap"
                        onClick={() => addAsContact(p)}
                        disabled={!p.email}
                        title={p.email ? undefined : "Needs an email — add them from the partner's Edit panel"}
                      >
                        Add to team <IconArrowRight size={11} />
                      </button>
                      <button type="button" className="text-ink-muted hover:text-red-600" onClick={() => dismiss(p.id)}>
                        <IconX size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The pipeline they're actively working */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="section-label">New partners you&apos;re developing</h3>
              <button type="button" className="link !text-xs" onClick={() => setAdding(!adding)}>
                <IconPlus size={11} /> Add a prospect
              </button>
            </div>

            {adding && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 mb-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    className="input !py-2 text-sm"
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <input
                    className="input !py-2 text-sm"
                    placeholder="Company"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                  />
                  <input
                    className="input !py-2 text-sm"
                    placeholder="Email (optional)"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <select
                    className="input !py-2 text-sm"
                    value={form.partner_type}
                    onChange={(e) => setForm({ ...form, partner_type: e.target.value })}
                  >
                    {Object.entries(PARTNER_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn-ghost !py-2 text-xs" onClick={addProspect}>
                  Add to pipeline
                </button>
              </div>
            )}

            {pipeline.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Met someone at a closing or a networking group? Park them here so the follow-up
                doesn&apos;t live in your head.
              </p>
            ) : (
              <ul className="space-y-2">
                {pipeline.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {p.name ?? p.company}
                        {p.name && p.company && <span className="text-ink-muted font-normal"> · {p.company}</span>}
                      </p>
                      {p.email && <p className="text-[11px] text-ink-muted truncate">{p.email}</p>}
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <select
                        className="input !py-1 !px-2 text-xs !w-auto"
                        value={p.status}
                        onChange={(e) => setStatus(p.id, e.target.value)}
                      >
                        {Object.entries(d.statuses).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="link !text-xs whitespace-nowrap" onClick={() => onConvert(p)}>
                        Make live <IconArrowRight size={11} />
                      </button>
                      <button
                        type="button"
                        className="text-ink-muted hover:text-red-600"
                        onClick={() => dismiss(p.id)}
                        title="Remove"
                      >
                        <IconX size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
