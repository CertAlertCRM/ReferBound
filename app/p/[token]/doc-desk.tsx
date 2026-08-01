"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconMail, IconCheck } from "../../icons";
import { PROCESSOR_ROLE_RE } from "@/lib/config";
import { ClauseLibrary } from "./clause-library";

// The processor's view of the portal.
//
// At an agency where the relationship is working, the loan officer decides
// once and then disappears — processors are the ones chasing documents into
// the file. Their job on this page is not "how's my pipeline," it's "give me
// the EOI for the three files closing Friday and the exact mortgagee wording."
//
// Same portal, same link. When the person viewing has identified themselves
// as a processor, this desk moves to the top; for everyone else it sits
// quietly below the pipeline where it belongs.

type Doc = { id: string; kind: string; label: string };
type Deal = {
  id: string;
  client: string;
  address: string | null;
  closing: string | null;
  docs: Doc[];
  clauseId?: string | null;
  clauseLabel?: string | null;
  clauseSource?: string | null;
};
type Clause = { id: string; label: string; is_default: boolean };

export function DocDesk({
  token,
  deals,
  contacts,
  mortgagee,
}: {
  token: string;
  deals: Deal[];
  contacts: { id: string; name: string; role: string | null }[];
  mortgagee: string | null;
}) {
  const [isProcessor, setIsProcessor] = useState(false);
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [dealClause, setDealClause] = useState<Record<string, string>>(
    Object.fromEntries(deals.filter((d) => d.clauseId).map((d) => [d.id, d.clauseId as string]))
  );

  // The library drives the per-file picker, so load it once here.
  useEffect(() => {
    fetch(`/api/p/${token}/clauses`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setClauses(j?.clauses ?? []))
      .catch(() => {});
  }, [token]);

  async function setClause(dealId: string, clauseId: string) {
    setDealClause((s) => ({ ...s, [dealId]: clauseId }));
    await fetch(`/api/p/${token}/referral-clause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: dealId, clause_id: clauseId || null }),
    }).catch(() => {});
  }

  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(`rb_sender_${token}`);
      const me = contacts.find((c) => c.id === savedId);
      setIsProcessor(PROCESSOR_ROLE_RE.test(me?.role ?? ""));
    } catch {}
  }, [token, contacts]);

  async function send(dealId: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/p/${token}/send-docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralId: dealId, to, note }),
    });
    setBusy(false);
    if (res.ok) {
      setSent(dealId);
      setSendFor(null);
      setTo("");
      setNote("");
      setTimeout(() => setSent(null), 4000);
    } else setError((await res.json()).error ?? "Couldn't send");
  }

  // Documents drive this list, but once a shop has more than one clause the
  // processor needs to set it BEFORE the EOI exists — that's the whole point of
  // designating it. So in-flight files show up too, with the picker and nothing
  // else.
  const withDocs = deals.filter((d) => d.docs.length > 0 || clauses.length > 1);


  return (
    <section className={`card p-5 space-y-3 ${isProcessor ? "order-first border-brand-200" : ""}`}>
      <div>
        <h2 className="font-semibold">Documents desk</h2>
        <p className="text-xs text-ink-secondary mt-0.5">
          A copy of everything issued so far, for your file and your system. Documents are also
          emailed out when they&apos;re delivered — this page is the backup copy, not somewhere you
          have to work.
        </p>
      </div>

      {mortgagee && clauses.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Mortgagee clause on file
          </p>
          <p className="text-sm text-ink mt-1 whitespace-pre-line font-medium">{mortgagee}</p>
          <button
            type="button"
            className="link !text-[11px] mt-1.5"
            onClick={async () => {
              await navigator.clipboard.writeText(mortgagee);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? "Copied ✓" : "Copy exact wording"}
          </button>
        </div>
      )}

      {/* One clause per shop was a model of a lender that doesn't exist. */}
      <ClauseLibrary token={token} />

      {withDocs.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No documents issued yet. They show up here once the policy is bound and the agent
          uploads them.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {withDocs.map((d) => (
            <li key={d.id} className="py-3 first:pt-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{d.client}</p>
                  <p className="text-[11px] text-ink-muted">
                    {d.address ? `${d.address} · ` : ""}
                    {d.closing ? `closes ${d.closing}` : "no closing date"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {sent === d.id ? (
                    <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1">
                      <IconCheck size={13} /> Sent
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="link !text-xs"
                      onClick={() => {
                        setSendFor(sendFor === d.id ? null : d.id);
                        setError("");
                      }}
                    >
                      <IconMail size={12} /> Send to someone
                    </button>
                  )}
                </div>
              </div>

              {clauses.length > 1 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-ink-muted shrink-0">Mortgagee clause:</span>
                  <select
                    className="input !py-1 !text-[11px] !w-auto"
                    value={dealClause[d.id] ?? ""}
                    onChange={(e) => setClause(d.id, e.target.value)}
                  >
                    <option value="">Use the default</option>
                    {clauses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                        {c.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  {d.clauseSource === "ai" && !dealClause[d.id] && (
                    <span className="badge bg-amber-50 text-amber-700 !text-[10px]">
                      matched from the file — change it if that's wrong
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-2">
                {d.docs.length === 0 && (
                  <span className="text-[11px] text-ink-muted">No documents issued yet</span>
                )}
                {d.docs.map((doc) => (
                  <a
                    key={doc.id}
                    href={`/api/docs/${doc.id}/download?t=${token}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-secondary hover:border-brand-300 hover:text-brand transition-colors"
                  >
                    <IconDownload size={12} /> {doc.label}
                  </a>
                ))}
              </div>

              {sendFor === d.id && (
                <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[11px] text-ink-secondary">
                    Emails every document above as download links — to your processor, underwriter,
                    or closing desk. If someone needs them on every file, ask the agent to add them
                    as a document recipient and they&apos;ll arrive automatically.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      className="input !py-2 text-sm"
                      type="email"
                      placeholder="their@email.com"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="input !py-2 text-sm"
                      placeholder="Note (optional) — e.g. loan #12345"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-3 text-xs"
                    disabled={busy || !to.trim()}
                    onClick={() => send(d.id)}
                  >
                    {busy ? "Sending…" : "Send documents"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
