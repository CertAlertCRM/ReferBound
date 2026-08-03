"use client";

import { useState } from "react";
import { IconUsers, IconCopy, IconCheck, IconSparkles, IconMail } from "../../icons";
import { useUI } from "../../ui";

// The other side of a realtor's deal.
//
// Only shows on referrals that came from a realtor, because that's the only
// place the question makes sense — on a lender's own referral the loan officer
// is already the partner.
//
// The shape of this panel follows how realtors actually refer: by phone. No
// loan application arrives, no insurance request, nothing naming the loan
// officer. So the details can only come from asking, and the ask has to be
// worth the realtor's four minutes.
//
// It is, because the reason isn't networking. Knowing the loan officer lets the
// agent send the mortgage team the evidence of insurance before anybody chases
// it — which helps the realtor's closing, which is why they answer. The
// relationship is what happens afterwards.
//
// Three steps, and the panel only ever leads with the one that's live:
//   1. no lender yet   → ask the realtor
//   2. lender, bound   → send them the documents, unprompted
//   3. documents sent  → now talk about working together

type Lender = { name?: string | null; company?: string | null; email?: string | null; phone?: string | null };
type DraftKind = "contact_ask" | "lender_docs" | "lender_intro" | "realtor_ask";

export function LenderLink({
  referralId,
  realtorName,
  clientFirst,
  lender: initial,
  covered,
  hasDocs,
  docsSentAt,
  onSaved,
}: {
  referralId: string;
  realtorName: string;
  clientFirst: string;
  lender: Lender | null;
  covered: boolean;
  hasDocs: boolean;
  docsSentAt: string | null;
  onSaved: () => void;
}) {
  const { toast } = useUI();
  const [lender, setLender] = useState<Lender>(initial ?? {});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alreadyPartner, setAlreadyPartner] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean>(Boolean(docsSentAt));
  const [copied, setCopied] = useState(false);

  const has = Boolean(lender.name || lender.company);
  const label = lender.name || lender.company || "";
  const first = label.split(" ")[0];
  const realtorFirst = realtorName.split(" ")[0];

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

  async function makeDraft(kind: DraftKind) {
    setBusy(true);
    const res = await fetch(`/api/referrals/${referralId}/lender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setDraft(j.text);
      if (kind === "lender_docs") setSent(true);
    } else toast(j.error ?? "Couldn't draft that", "error");
  }

  const draftBox = draft && (
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
        <span className="text-[11px] text-ink-muted">Edit it first — nothing sends from here.</span>
      </div>
    </div>
  );

  const fields = (
    <>
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
          placeholder="Their email — this is the one that matters"
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
  );

  // ── Step 1: nobody knows who the lender is yet ────────────────────────────
  if (!has) {
    return (
      <section className="card p-5 space-y-3">
        <h2 className="section-label">Who&apos;s handling {clientFirst}&apos;s loan?</h2>
        <p className="text-xs text-ink-secondary leading-relaxed">
          {realtorFirst} knows, and almost certainly called you rather than sending anything in
          writing — so this is the one detail worth asking for. With the loan officer&apos;s email
          you can send the mortgage team the evidence of insurance the day it&apos;s issued, instead
          of waiting for a processor to chase it. That is the thing agents get remembered for.
        </p>

        {editing ? (
          fields
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn-primary !py-1.5 !px-3 text-xs"
              disabled={busy}
              onClick={() => makeDraft("contact_ask")}
            >
              <IconSparkles size={13} /> Draft the ask to {realtorFirst}
            </button>
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setEditing(true)}>
              I already know — add them
            </button>
          </div>
        )}
        {draftBox}
      </section>
    );
  }

  // ── Steps 2 and 3: we know who they are ───────────────────────────────────
  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="section-label">The other side of this deal</h2>
        {!editing && (
          <button type="button" className="link !text-[11px]" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        fields
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-brand-light text-brand grid place-items-center shrink-0">
              <IconUsers size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-[11px] text-ink-muted truncate">
                {lender.company && lender.name ? `${lender.company} · ` : ""}
                {lender.email || "no email yet — that's the one worth chasing"}
              </p>
            </div>
          </div>

          {/* Step 2. The whole reason for knowing who they are. */}
          {!sent && (
            <div className="rounded-xl border border-brand-200 bg-brand-light/40 p-3 space-y-2">
              <p className="text-xs text-ink-secondary leading-relaxed">
                {covered && hasDocs ? (
                  <>
                    <span className="font-semibold text-ink">
                      Send {first} the documents now, before anyone asks.
                    </span>{" "}
                    The links are signed and expiring — they open the document itself, not a portal,
                    so nothing else of yours is exposed.
                  </>
                ) : covered ? (
                  <>Upload the EOI and you can hand it straight to {first} ahead of the request.</>
                ) : (
                  <>
                    The moment this binds and the EOI is uploaded, you can send it to {first} without
                    waiting to be asked. That&apos;s the whole reason to have their email.
                  </>
                )}
              </p>
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                disabled={busy || !covered || !hasDocs}
                onClick={() => makeDraft("lender_docs")}
                title={
                  !covered
                    ? "Available once the policy is bound"
                    : !hasDocs
                      ? "Upload the EOI first"
                      : undefined
                }
              >
                <IconMail size={13} /> Send {first} the documents
              </button>
            </div>
          )}

          {sent && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Documents handed to {first} ahead of the request. That&apos;s the part they remember.
            </p>
          )}

          {/* Step 3. Only worth anything after they've seen the work. */}
          {alreadyPartner ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              Already one of your partners — nothing else to do here.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-secondary leading-relaxed">
                {sent
                  ? `${first} has now watched you deliver on a shared file without being chased. This is the week to ask.`
                  : `Once ${first} has seen your documents land early on this file, the conversation about working together is a different one.`}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className={sent ? "btn-primary !py-1.5 !px-3 text-xs" : "btn-ghost !py-1.5 !px-3 text-xs"}
                  disabled={busy}
                  onClick={() => makeDraft("lender_intro")}
                >
                  <IconSparkles size={13} /> Draft a note to {first}
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={() => makeDraft("realtor_ask")}
                >
                  Ask {realtorFirst} to introduce us
                </button>
              </div>
            </>
          )}

          {draftBox}
        </>
      )}
    </section>
  );
}
