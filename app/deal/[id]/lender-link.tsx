"use client";

import { useState } from "react";
import { IconUsers, IconCopy, IconCheck, IconSparkles } from "../../icons";
import { useUI } from "../../ui";

// The other side of a realtor's deal.
//
// Only shows on referrals that came from a realtor, because that's the only
// place the question makes sense — on a lender's own referral the loan officer
// is already the partner. One field, then two drafts the agent reads before
// anything leaves their outbox.
//
// The sequencing is deliberate: the introduction is offered quietly while the
// deal is in flight and steps forward once it's covered. That's the week the
// loan officer just watched this agent deliver.

type Lender = { name?: string | null; company?: string | null; email?: string | null; phone?: string | null };

export function LenderLink({
  referralId,
  realtorName,
  clientFirst,
  lender: initial,
  covered,
  onSaved,
}: {
  referralId: string;
  realtorName: string;
  clientFirst: string;
  lender: Lender | null;
  covered: boolean;
  onSaved: () => void;
}) {
  const { toast } = useUI();
  const [lender, setLender] = useState<Lender>(initial ?? {});
  const [editing, setEditing] = useState(!initial?.name && !initial?.company);
  const [busy, setBusy] = useState(false);
  const [alreadyPartner, setAlreadyPartner] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const has = Boolean(lender.name || lender.company);
  const label = lender.name || lender.company || "";

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/referrals/${referralId}/lender`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lender }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Couldn't save", "error");
      return;
    }
    const j = await res.json();
    setAlreadyPartner(j.alreadyPartner ?? null);
    setEditing(false);
    onSaved();
  }

  async function makeDraft(kind: "lender_intro" | "realtor_ask") {
    setBusy(true);
    const res = await fetch(`/api/referrals/${referralId}/lender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setBusy(false);
    if (res.ok) setDraft((await res.json()).text);
    else toast((await res.json()).error ?? "Couldn't draft that", "error");
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="section-label">The other side of this deal</h2>
        {has && !editing && (
          <button type="button" className="link !text-[11px]" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <p className="text-xs text-ink-secondary">
            Who&apos;s handling {clientFirst}&apos;s loan? {realtorName} almost certainly knows. Worth
            asking — it lets you send the evidence of insurance straight to the loan officer instead
            of through {realtorName.split(" ")[0]}, and it&apos;s how a realtor referral turns into a
            lender relationship.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className="input !py-2 text-sm"
              placeholder="Loan officer's name"
              value={lender.name ?? ""}
              onChange={(e) => setLender({ ...lender, name: e.target.value })}
            />
            <input
              className="input !py-2 text-sm"
              placeholder="Their company"
              value={lender.company ?? ""}
              onChange={(e) => setLender({ ...lender, company: e.target.value })}
            />
            <input
              className="input !py-2 text-sm"
              type="email"
              placeholder="Their email (optional)"
              value={lender.email ?? ""}
              onChange={(e) => setLender({ ...lender, email: e.target.value })}
            />
            <input
              className="input !py-2 text-sm"
              type="tel"
              placeholder="Their phone (optional)"
              value={lender.phone ?? ""}
              onChange={(e) => setLender({ ...lender, phone: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary !py-1.5 !px-3 text-xs"
              disabled={busy || (!lender.name && !lender.company)}
              onClick={save}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {has && (
              <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-brand-light text-brand grid place-items-center shrink-0">
              <IconUsers size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-[11px] text-ink-muted">
                {lender.company && lender.name ? `${lender.company} · ` : ""}
                {lender.email || "handling the loan"}
              </p>
            </div>
          </div>

          {alreadyPartner ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              Already one of your partners — nothing to do here.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-secondary">
                {covered
                  ? `${clientFirst} is covered, which means ${label.split(" ")[0]} just watched your evidence of insurance land correct and on time. This is the week to ask.`
                  : `Once ${clientFirst} is covered, ${label.split(" ")[0]} will have seen your work firsthand — that's the moment worth using.`}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className={covered ? "btn-primary !py-1.5 !px-3 text-xs" : "btn-ghost !py-1.5 !px-3 text-xs"}
                  disabled={busy}
                  onClick={() => makeDraft("lender_intro")}
                >
                  <IconSparkles size={13} /> Draft a note to {label.split(" ")[0]}
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={() => makeDraft("realtor_ask")}
                >
                  Ask {realtorName.split(" ")[0]} to introduce us
                </button>
              </div>
            </>
          )}

          {draft && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <textarea
                className="input !text-[13px] w-full min-h-[190px] font-sans"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn-primary !py-1.5 !px-3 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(draft);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? (
                    <>
                      <IconCheck size={13} /> Copied
                    </>
                  ) : (
                    <>
                      <IconCopy size={13} /> Copy it
                    </>
                  )}
                </button>
                <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setDraft(null)}>
                  Close
                </button>
                <span className="text-[11px] text-ink-muted">
                  Edit it first — nothing sends from here.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
