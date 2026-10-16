"use client";

import { useEffect, useState } from "react";
import { UpgradeModal } from "./upgrade";
import { IconCopy, IconCheck, IconUsers } from "./icons";

// Two things an agent needs in one place: the link they hand out, and the
// people it brought them.
//
// Deliberately one card rather than two sections. The link is worthless
// without somewhere for the replies to land, and a requests queue nobody can
// see is how a loan officer who signed up on Tuesday never hears back.

type Request = {
  id: string;
  contact_name: string;
  company: string | null;
  email: string;
  phone: string | null;
  partner_type: string;
  note: string | null;
  locale: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  lender: "Loan officer",
  realtor: "Real estate agent",
  processor: "Processor",
  cpa: "CPA",
  other: "Other",
};

export function PartnerRequests({ onApproved }: { onApproved?: () => void }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "caption" | null>(null);
  const [wall, setWall] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showLink, setShowLink] = useState(false);

  async function load() {
    const [rRes, lRes] = await Promise.all([
      fetch("/api/partners/requests"),
      fetch("/api/partners/join-link"),
    ]);
    if (rRes.ok) setRequests((await rRes.json()).requests ?? []);
    if (lRes.ok) setUrl((await lRes.json()).url ?? null);
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  async function makeLink() {
    setBusy("link");
    setError("");
    const res = await fetch("/api/partners/join-link", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(json?.error ?? "Couldn't create the link");
      return;
    }
    setUrl(json.url);
    setShowLink(true);
  }

  async function act(id: string, action: "approve" | "decline") {
    setBusy(id);
    setError("");
    const res = await fetch("/api/partners/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.status === 402) {
      // The best possible moment to ask: a real person is at the door.
      setWall(json?.error ?? null);
      return;
    }
    if (!res.ok) {
      setError(json?.error ?? "Couldn't do that");
      return;
    }
    setRequests((rs) => rs.filter((r) => r.id !== id));
    if (action === "approve") onApproved?.();
  }

  async function copy(what: "url" | "caption", text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  // What she'll actually paste into a post. Plain, specific, and carefully not
  // promising that the portal replaces a phone call — it's an addition to how
  // people already work, never a substitute.
  const caption = url
    ? `If you send me referrals — realtors, loan officers, anyone — I set you up with a live page where you can see exactly where each one stands, and pull the insurance documents yourself once the policy is bound.\n\nNo login, no app. Just your own link.\n\nAdd yourself here: ${url}`
    : "";

  if (!loaded) return null;

  const hasRequests = requests.length > 0;

  return (
    <>
      <section className="space-y-2.5">
        {hasRequests && (
          <>
            <h2 className="section-label flex items-center gap-2">
              <IconUsers size={13} />
              Asking to join · {requests.length}
            </h2>
            <div className="space-y-2.5">
              {requests.map((r) => (
                <div key={r.id} className="card p-4 border-brand-200 bg-brand-light/30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">
                        {r.contact_name}
                        {r.company ? (
                          <span className="font-normal text-ink-secondary"> · {r.company}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        {TYPE_LABEL[r.partner_type] ?? r.partner_type} · {r.email}
                        {r.phone ? ` · ${r.phone}` : ""}
                        {r.locale === "es" ? " · Español" : ""}
                      </p>
                      {r.note && (
                        <p className="text-sm mt-2 text-ink-secondary italic">“{r.note}”</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => act(r.id, "decline")}
                        disabled={busy === r.id}
                        className="btn-ghost !px-3 !py-1.5 text-xs"
                      >
                        Not them
                      </button>
                      <button
                        onClick={() => act(r.id, "approve")}
                        disabled={busy === r.id}
                        className="btn-primary !px-3 !py-1.5 text-xs"
                      >
                        {busy === r.id ? "…" : "Approve"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted">
              Approving creates their portal. Nothing has been sent to them yet — use “Email the
              link” once they&apos;re in.
            </p>
          </>
        )}

        {/* The link itself. Tucked behind a disclosure when there's nothing
            waiting, so the partners page doesn't lead with a marketing box. */}
        {!url ? (
          <button onClick={makeLink} disabled={busy === "link"} className="card card-hover p-4 w-full text-left">
            <p className="font-semibold text-sm">
              {busy === "link" ? "Creating…" : "Create a link anyone can join through"}
            </p>
            <p className="text-xs text-ink-secondary mt-0.5">
              One URL for your email signature or a social post. People add themselves, you approve.
            </p>
          </button>
        ) : (
          <div className="card p-4 space-y-3">
            <button
              onClick={() => setShowLink((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className="font-semibold text-sm">Your join link</span>
              <span className="link text-xs">{showLink ? "Hide" : "Show"}</span>
            </button>

            {showLink && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate text-xs bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-200">
                    {url}
                  </code>
                  <button onClick={() => copy("url", url)} className="btn-ghost !px-2.5 !py-2">
                    {copied === "url" ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </button>
                </div>

                <div>
                  <p className="section-label">Ready to post</p>
                  <textarea
                    readOnly
                    value={caption}
                    className="input mt-1.5 min-h-[132px] text-xs leading-relaxed"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={() => copy("caption", caption)}
                    className="btn-ghost !px-3 !py-1.5 text-xs mt-1.5"
                  >
                    {copied === "caption" ? "Copied" : "Copy caption"}
                  </button>
                </div>

                <p className="text-[11px] text-ink-muted">
                  The page opens in English or Spanish depending on the visitor&apos;s phone, and
                  they can switch. Add <code>?lang=es</code> to the link to open it in Spanish for
                  everyone.
                </p>

                <button
                  onClick={makeLink}
                  disabled={busy === "link"}
                  className="link text-xs normal-case tracking-normal"
                >
                  Replace this link
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      </section>

      {wall && (
        <UpgradeModal
          kicker="Someone's at the door"
          title="They asked to be let in"
          footnote="Your deals, partners and documents stay exactly where they are."
          onClose={() => setWall(null)}
        >
          <p>{wall}</p>
          <p>
            The request keeps waiting either way — approve it whenever the seat is there, and
            nothing about it expires in the meantime.
          </p>
        </UpgradeModal>
      )}
    </>
  );
}
