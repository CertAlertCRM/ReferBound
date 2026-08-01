"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "../components";
import { IconMail, IconCheck, IconX, IconCopy, IconArrowRight, IconAlert } from "../icons";
import { SkeletonPage } from "../skeleton";
import { useUI } from "../ui";

// Email intake.
//
// The forwarding address turns the most common way a referral actually
// arrives — an email from a loan officer — into a logged lead. Anything from
// a sender we recognize is already a lead by the time the agent looks. This
// page is for everything else: unknown senders, thin extractions, the ones
// worth a human glance before they become real.

type Row = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body: string | null;
  match_kind: string | null;
  extracted: any;
  status: string;
  referral_id: string | null;
  error: string | null;
  created_at: string;
  partners: { id: string; name: string } | null;
};

const FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "client_name", label: "Client" },
  { key: "coborrower_name", label: "Coborrower" },
  { key: "client_phone", label: "Phone" },
  { key: "client_email", label: "Email", type: "email" },
  { key: "property_address", label: "Property address" },
  { key: "closing_date", label: "Closing date", type: "date" },
  { key: "loan_number", label: "Loan #" },
];

export default function InboxPage() {
  const { toast } = useUI();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [partnerId, setPartnerId] = useState("");
  const [ack, setAck] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDone, setShowDone] = useState(false);

  async function load() {
    const [iRes, pRes] = await Promise.all([fetch("/api/inbox"), fetch("/api/partners")]);
    if (iRes.ok) {
      const j = await iRes.json();
      setRows(j.emails ?? []);
      setAddress(j.address ?? null);
    } else setRows([]);
    if (pRes.ok) setPartners((await pRes.json()).partners ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  function open(r: Row) {
    setOpenId(r.id);
    setPartnerId(r.partners?.id ?? "");
    setAck(true);
    const e = r.extracted ?? {};
    const f: Record<string, string> = {};
    for (const { key } of FIELDS) f[key] = e[key] ?? "";
    f.notes = e.notes ?? "";
    setFields(f);
  }

  async function act(id: string, action: "create" | "ignore") {
    setBusy(true);
    const res = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, partner_id: partnerId, fields, acknowledge: ack }),
    });
    setBusy(false);
    if (res.ok) {
      setOpenId(null);
      toast(action === "create" ? "Lead created" : "Dismissed");
      load();
    } else toast((await res.json()).error ?? "Something went wrong", "error");
  }

  if (!rows) {
    return (
      <>
        <TopNav active="inbox" />
        <main className="max-w-3xl mx-auto p-4 sm:p-6">
          <SkeletonPage tiles={0} rows={3} />
        </main>
      </>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <>
      <TopNav active="inbox" />
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Email intake</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Forward a referral email here and it becomes a lead — the sender matched to the right
            partner, the client details pulled out, and your reply already sent.
          </p>
        </div>

        <div className="card p-5 border-brand-200 bg-brand-light/30">
          <p className="section-label mb-1.5">Your forwarding address</p>
          {address ? (
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 select-all break-all">
                {address}
              </code>
              <button
                type="button"
                className="btn-ghost !py-2 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? (
                  <>
                    <IconCheck size={13} /> Copied
                  </>
                ) : (
                  <>
                    <IconCopy size={13} /> Copy
                  </>
                )}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Setting up your address…</p>
          )}
          <p className="text-xs text-ink-secondary mt-2.5 max-w-xl">
            Forward the intro email as you get it, or set a rule in Outlook or Gmail to forward
            them automatically. Emails from partners you already work with become leads on their
            own; anything from a sender we don&apos;t recognize waits here for you, and nothing is
            ever auto-replied to a stranger.
          </p>
        </div>

        {pending.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="font-semibold">Nothing waiting</p>
            <p className="text-sm text-ink-secondary mt-1 max-w-md mx-auto">
              Referrals forwarded from partners you already work with go straight to your
              dashboard. Only the ones that need a second look land here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <h2 className="section-label">Waiting on you ({pending.length})</h2>
            {pending.map((r) => {
              const e = r.extracted ?? {};
              const isOpen = openId === r.id;
              return (
                <div key={r.id} className={`card p-4 ${isOpen ? "border-brand-200" : "card-hover"}`}>
                  <button type="button" className="w-full text-left" onClick={() => (isOpen ? setOpenId(null) : open(r))}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">
                          {e.client_name || r.subject || "(no subject)"}
                        </p>
                        <p className="text-xs text-ink-muted mt-0.5">
                          from {r.from_name ? `${r.from_name} · ` : ""}
                          {r.from_email}
                        </p>
                      </div>
                      <span className="shrink-0 flex items-center gap-1.5">
                        {r.match_kind === "none" ? (
                          <span className="badge bg-amber-50 text-amber-700">
                            <IconAlert size={10} /> unknown sender
                          </span>
                        ) : (
                          <span className="badge bg-brand-light text-brand">{r.partners?.name}</span>
                        )}
                        {e.is_referral === false && (
                          <span className="badge bg-slate-100 text-ink-muted">not a referral?</span>
                        )}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                      {r.body && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-ink-secondary hover:text-ink">
                            Read the original email
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] text-ink-secondary bg-slate-50 rounded-lg p-3 max-h-64 overflow-auto">
                            {r.body}
                          </pre>
                        </details>
                      )}

                      <div>
                        <label className="section-label block mb-1">Partner</label>
                        <select
                          className="input !py-2 text-sm"
                          value={partnerId}
                          onChange={(ev) => setPartnerId(ev.target.value)}
                        >
                          <option value="">Which partner sent this?</option>
                          {partners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {FIELDS.map((f) => (
                          <label key={f.key} className="block">
                            <span className="text-[11px] text-ink-muted">{f.label}</span>
                            <input
                              className="input !py-2 text-sm"
                              type={f.type ?? "text"}
                              value={fields[f.key] ?? ""}
                              onChange={(ev) => setFields((s) => ({ ...s, [f.key]: ev.target.value }))}
                            />
                          </label>
                        ))}
                      </div>

                      <label className="flex items-start gap-2 cursor-pointer text-[11px] text-ink-secondary">
                        <input
                          type="checkbox"
                          className="accent-brand mt-0.5"
                          checked={ack}
                          onChange={(ev) => setAck(ev.target.checked)}
                        />
                        <span>
                          Reply to {r.from_email} that you&apos;ve got it and you&apos;re working on the
                          quote
                          <span className="block text-ink-muted">
                            Uncheck if you already answered them yourself.
                          </span>
                        </span>
                      </label>

                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          className="btn-primary !py-2 !px-3 text-xs"
                          disabled={busy}
                          onClick={() => act(r.id, "create")}
                        >
                          <IconCheck size={13} /> {busy ? "Working…" : "Log as a lead"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !py-2 !px-3 text-xs"
                          disabled={busy}
                          onClick={() => act(r.id, "ignore")}
                        >
                          <IconX size={13} /> Not a referral
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-2.5">
            <button
              type="button"
              className="section-label hover:text-ink transition-colors"
              onClick={() => setShowDone(!showDone)}
            >
              Recently handled ({done.length}) {showDone ? "▲" : "▼"}
            </button>
            {showDone &&
              done.map((r) => (
                <div key={r.id} className="card p-3.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.extracted?.client_name || r.subject || "(no subject)"}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {r.from_email} · {r.status === "created" ? "logged as a lead" : "dismissed"}
                    </p>
                  </div>
                  {r.referral_id && (
                    <Link href={`/deal/${r.referral_id}`} className="link !text-[11px] shrink-0">
                      Open the file <IconArrowRight size={11} />
                    </Link>
                  )}
                </div>
              ))}
          </div>
        )}

        <p className="text-[11px] text-ink-muted flex items-start gap-1.5">
          <IconMail size={12} className="mt-0.5 shrink-0" />
          Forwarding is a complement, not a replacement — partners who prefer their portal, a
          phone call, or a text keep working exactly the way they do now.
        </p>
      </main>
    </>
  );
}
