"use client";

import { useState } from "react";
import { IconMail, IconCheck, IconAlert } from "../../icons";
import { useUI } from "../../ui";

// The client half of the deal.
//
// Every file has two audiences and the product only ever served one. These are
// the three emails the agent types by hand on every single deal — the quote
// (with the loan officer copied, the way they already send it), the check-in
// while it sits, and the welcome with proof of insurance once it's bound.
//
// Deliberately not a wall of controls: one line of state, one button, and the
// rest stays out of the way until it's the right moment for it.
//
// The reps live here too, and only after the welcome has gone out. Asking a
// client for a favour before you've handed them their documents is the wrong
// order, and the product should not make that easy.

type Props = {
  referralId: string;
  clientName: string;
  clientEmail: string | null;
  partnerName: string;
  status: string;
  hasQuoteDoc: boolean;
  hasEoi: boolean;
  quoteSentAt: string | null;
  welcomeSentAt: string | null;
  nudgedAt: string | null;
  askedAt: string | null;
  reviewAskedAt: string | null;
  onDone: () => void;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function ClientTrack(p: Props) {
  const { toast } = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const [ccPartner, setCcPartner] = useState(true);

  async function send(action: "quote" | "welcome" | "nudge" | "ask" | "review") {
    setBusy(action);
    const res = await fetch(`/api/referrals/${p.referralId}/client-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, cc_partner: ccPartner }),
    });
    setBusy(null);
    if (res.ok) {
      const j = await res.json();
      toast(
        action === "quote"
          ? j.cc?.length > 0
            ? `Quote sent to ${p.clientName.split(" ")[0]}, ${p.partnerName} copied`
            : `Quote sent to ${p.clientName.split(" ")[0]}`
          : action === "welcome"
            ? "Welcome email sent"
            : action === "ask"
              ? `Asked ${p.clientName.split(" ")[0]} for a referral`
              : action === "review"
                ? "Review request sent"
                : "Check-in sent"
      );
      p.onDone();
    } else toast((await res.json()).error ?? "Couldn't send", "error");
  }

  // The ask that happened out loud. No email, no recipient — just the record,
  // which is the only thing the queue and the earned-share number ever wanted.
  async function mark(kind: "referral" | "review", clear = false) {
    const key = `mark-${kind}`;
    setBusy(key);
    const res = await fetch(`/api/referrals/${p.referralId}/asked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, how: "in_person", clear }),
    });
    setBusy(null);
    if (res.ok) {
      toast(
        clear
          ? "Unmarked"
          : kind === "review"
            ? "Marked — you asked for the review"
            : `Marked — you asked ${p.clientName.split(" ")[0]}`
      );
      p.onDone();
    } else toast((await res.json()).error ?? "Couldn't save", "error");
  }

  const first = p.clientName.split(" ")[0];
  const sinceQuote = daysSince(p.quoteSentAt);
  const bound = ["bound", "docs_delivered"].includes(p.status);

  // Worth nudging: quoted, not bound, sitting more than three days, and not
  // already nudged in the last week. Never automatic — a client hearing from
  // an agent should be the agent's decision.
  const nudgeWorthy =
    !bound && sinceQuote !== null && sinceQuote >= 3 && (daysSince(p.nudgedAt) ?? 99) >= 7;

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="section-label">The client</h2>
        <p className="text-[11px] text-ink-muted">
          {p.clientEmail ? p.clientEmail : "no email on file"}
        </p>
      </div>

      {!p.clientEmail ? (
        <p className="text-xs text-ink-secondary bg-slate-50 rounded-lg px-3 py-2.5">
          Add {first}&apos;s email above and you can send the quote and their proof of insurance
          straight from here — with {p.partnerName} copied, the way you send it now.
        </p>
      ) : (
        <>
          {/* Quote */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.quoteSentAt ? "Quote sent" : "Send the quote"}
              </p>
              <p className="text-[11px] text-ink-muted">
                {p.quoteSentAt
                  ? `${sinceQuote === 0 ? "today" : `${sinceQuote}d ago`}${
                      ccPartner ? ` · ${p.partnerName} was copied` : ""
                    }`
                  : p.hasQuoteDoc
                    ? `Goes to ${first} with ${p.partnerName} copied — and marks this Quoted`
                    : "Upload the quote below first"}
              </p>
            </div>
            <button
              type="button"
              className={p.quoteSentAt ? "btn-ghost !py-1.5 !px-3 text-xs" : "btn-primary !py-1.5 !px-3 text-xs"}
              disabled={busy !== null || !p.hasQuoteDoc}
              onClick={() => send("quote")}
              title={!p.hasQuoteDoc ? "Upload the quote document first" : undefined}
            >
              {busy === "quote" ? (
                "Sending…"
              ) : p.quoteSentAt ? (
                "Resend"
              ) : (
                <>
                  <IconMail size={13} /> Send quote
                </>
              )}
            </button>
          </div>

          {!p.quoteSentAt && p.hasQuoteDoc && (
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-secondary">
              <input
                type="checkbox"
                className="accent-brand"
                checked={ccPartner}
                onChange={(e) => setCcPartner(e.target.checked)}
              />
              Copy {p.partnerName} on it — one thread instead of a separate update
            </label>
          )}

          {/* Nudge — only surfaces when it's actually earned */}
          {nudgeWorthy && (
            <div className="flex items-start justify-between gap-3 flex-wrap rounded-xl bg-amber-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-900 flex items-center gap-1.5">
                  <IconAlert size={12} /> {sinceQuote} days with no answer
                </p>
                <p className="text-[11px] text-amber-800">
                  A short check-in, in your words. Nothing goes out on a schedule.
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-3 text-xs shrink-0"
                disabled={busy !== null}
                onClick={() => send("nudge")}
              >
                {busy === "nudge" ? "Sending…" : "Check in with " + first}
              </button>
            </div>
          )}

          {/* Welcome — the client's own copy, separate from the lender's */}
          {bound && (
            <div className="flex items-start justify-between gap-3 flex-wrap pt-1 border-t border-slate-100">
              <div className="min-w-0 pt-2">
                <p className="text-sm font-medium">
                  {p.welcomeSentAt ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <IconCheck size={14} /> Welcome email sent
                    </span>
                  ) : (
                    "Welcome email"
                  )}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {p.hasEoi
                    ? `${first}'s own copy of the proof of insurance — separate from ${p.partnerName}'s`
                    : "Upload the EOI below first"}
                </p>
              </div>
              <button
                type="button"
                className={
                  p.welcomeSentAt ? "btn-ghost !py-1.5 !px-3 text-xs mt-2" : "btn-primary !py-1.5 !px-3 text-xs mt-2"
                }
                disabled={busy !== null || !p.hasEoi}
                onClick={() => send("welcome")}
              >
                {busy === "welcome" ? "Sending…" : p.welcomeSentAt ? "Resend" : "Send welcome"}
              </button>
            </div>
          )}

        </>
      )}
      {/* The reps.
          Outside the email branch on purpose. The ask that works in this
          business happens out loud — at the desk when they sign, or on the
          phone when you tell them they're covered. Gating it behind "has an
          email address" and "sent the welcome" meant a producer doing it the
          right way looked, to this product, like somebody who never asks. */}
      {bound && (
        <div className="rounded-xl border border-brand-200 bg-brand-light/40 p-3.5 space-y-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium">
                {p.askedAt ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <IconCheck size={14} /> Asked {first} for a referral
                  </span>
                ) : (
                  `Ask ${first} for a referral`
                )}
              </p>
              {p.askedAt && (
                <button
                  type="button"
                  className="text-[11px] text-ink-muted hover:text-ink underline underline-offset-2"
                  disabled={busy !== null}
                  onClick={() => mark("referral", true)}
                >
                  undo
                </button>
              )}
            </div>

            {p.askedAt ? (
              <p className="text-[11px] text-ink-secondary">
                {daysSince(p.askedAt) === 0 ? "Today" : `${daysSince(p.askedAt)} days ago`} —
                anything they send comes back credited to you.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-ink-secondary">
                  Right now is the moment — they have their documents and nothing has gone wrong
                  yet. Say it in your words; this is roughly the shape of it:
                </p>
                <p className="text-xs text-ink italic bg-white/70 rounded-lg px-3 py-2 border border-brand-100">
                  &ldquo;Most of my business comes from people like you rather than from
                  advertising. If somebody you know is closing on a house, or their renewal just
                  jumped, would you mind giving them my name?&rdquo;
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-3 text-xs"
                    disabled={busy !== null}
                    onClick={() => mark("referral")}
                  >
                    {busy === "mark-referral" ? "Saving…" : "I asked them"}
                  </button>
                  {p.clientEmail && p.welcomeSentAt && (
                    <button
                      type="button"
                      className="btn-ghost !py-1.5 !px-3 text-xs"
                      disabled={busy !== null}
                      onClick={() => send("ask")}
                    >
                      {busy === "ask" ? "Sending…" : (
                        <>
                          <IconMail size={13} /> Send it instead
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-start justify-between gap-3 flex-wrap border-t border-brand-100 pt-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.reviewAskedAt ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <IconCheck size={14} /> Review asked
                  </span>
                ) : (
                  "Ask for a review"
                )}
              </p>
              <p className="text-[11px] text-ink-secondary">
                A review is a referral to people who haven&apos;t met you yet.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!p.reviewAskedAt && (
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  disabled={busy !== null}
                  onClick={() => mark("review")}
                >
                  {busy === "mark-review" ? "Saving…" : "I asked"}
                </button>
              )}
              {p.clientEmail && p.welcomeSentAt && (
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  disabled={busy !== null}
                  onClick={() => send("review")}
                >
                  {busy === "review" ? "Sending…" : p.reviewAskedAt ? "Ask again" : "Send"}
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-ink-muted">
            Anything sent from here is drafted in your words and goes out when you press the
            button. Nothing leaves on its own.
          </p>
        </div>
      )}

    </section>
  );
}
