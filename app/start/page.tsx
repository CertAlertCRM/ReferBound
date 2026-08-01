"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopNav } from "../components";
import { BackfillButton } from "../backfill";
import { IconArrowRight, IconCheck, IconUsers, IconZap } from "../icons";
import { useUI } from "../ui";

// The ramp.
//
// "Add a lending partner" is a wall for an agent who doesn't have one, and
// that's most new agents. But almost nobody answers "who has sent you a client
// in the last year?" with nobody — there's a realtor, someone at a credit
// union, a friend, a client who keeps sending people. Start there, backfill
// what they already sent, and the agent has real numbers on day one instead of
// an empty board and a wait.
//
// This is a ramp, not a repositioning. Lenders are still where this product
// earns its keep; this is how someone gets far enough to find that out.

type Source = {
  key: string;
  label: string;
  hint: string;
  partner_type: string;
};

const SOURCES: Source[] = [
  {
    key: "lender",
    label: "A loan officer or processor",
    hint: "Anyone at a lender who's sent you a buyer, even once",
    partner_type: "lender",
  },
  {
    key: "realtor",
    label: "A realtor",
    hint: "An agent whose buyers have ended up with you",
    partner_type: "realtor",
  },
  {
    key: "cpa",
    label: "A CPA or financial advisor",
    hint: "Someone whose clients come to you for coverage",
    partner_type: "cpa",
  },
  {
    key: "personal",
    label: "A friend, family member, or client",
    hint: "The person who keeps sending you people",
    partner_type: "friend_family",
  },
];

export default function StartPage() {
  const { toast } = useUI();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source | null>(null);
  const [personName, setPersonName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(null);
  const [counts, setCounts] = useState<{ leads: number; bound: number; premium: number } | null>(null);

  // If they already have a partner, this page has done its job — send them home.
  useEffect(() => {
    fetch("/api/partners").then(async (r) => {
      if (!r.ok) return;
      const { partners } = await r.json();
      if ((partners ?? []).length > 0 && step === 1 && !partner) router.replace("/");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createPartner() {
    if (!source || !personName.trim()) return;
    setBusy(true);
    // The partner is the shop when there is one, the person when there isn't —
    // a friend who sends you business isn't a company and shouldn't have to
    // pretend to be one.
    const name = company.trim() || personName.trim();
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emails: email, partner_type: source.partner_type }),
    });
    if (!res.ok) {
      setBusy(false);
      toast((await res.json()).error ?? "Couldn't add them", "error");
      return;
    }
    const { partner: p } = await res.json();

    // Record the human separately when we know both, so notifications route to
    // a person rather than a mailbox.
    if (company.trim() && email.trim()) {
      await fetch(`/api/partners/${p.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: personName.trim(), email: email.trim() }),
      }).catch(() => {});
    }
    setBusy(false);
    setPartner({ id: p.id, name: p.name });
    setStep(2);
  }

  async function loadCounts() {
    const r = await fetch("/api/referrals");
    if (!r.ok) return;
    const { referrals } = await r.json();
    const list = referrals ?? [];
    const bound = list.filter((x: any) => ["bound", "docs_delivered"].includes(x.status));
    setCounts({
      leads: list.length,
      bound: bound.length,
      premium: bound.reduce((a: number, x: any) => a + (x.premium ?? 0), 0),
    });
  }

  return (
    <>
      <TopNav />
      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
            Step {step} of 3
          </p>
          <h1 className="text-xl font-bold tracking-tight mt-1">
            {step === 1
              ? "Who has sent you a client?"
              : step === 2
                ? `What has ${partner?.name} sent you?`
                : "Here's your book"}
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            {step === 1
              ? "Not a formal partnership — anyone at all. Start with whoever has sent you the most, even if it's only been a couple."
              : step === 2
                ? "Add the ones they've already sent, closed or not. It takes a few minutes and it's what turns this from an empty page into your actual numbers."
                : "This is what you can show the next person who asks why they should send you business."}
          </p>
        </div>

        {step === 1 && (
          <>
            <div className="grid gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`card card-hover p-4 text-left flex items-center gap-3 ${
                    source?.key === s.key ? "border-brand-300 bg-brand-light/30" : ""
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full border-2 shrink-0 grid place-items-center ${
                      source?.key === s.key ? "border-brand bg-brand text-white" : "border-slate-300"
                    }`}
                  >
                    {source?.key === s.key && <IconCheck size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="text-sm font-semibold block">{s.label}</span>
                    <span className="text-xs text-ink-muted">{s.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {source && (
              <div className="card p-5 space-y-3">
                <label className="block">
                  <span className="section-label">Their name</span>
                  <input
                    className="input mt-1"
                    placeholder="Who is it?"
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    autoFocus
                  />
                </label>
                {source.partner_type !== "friend_family" && (
                  <label className="block">
                    <span className="section-label">Their company</span>
                    <span className="text-[11px] text-ink-muted block">
                      Skip it if they don&apos;t have one — their name works fine
                    </span>
                    <input
                      className="input mt-1"
                      placeholder="Optional"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="section-label">Their email</span>
                  <span className="text-[11px] text-ink-muted block">
                    Optional — you can add it later. Nothing is sent to them until you decide to
                    send it.
                  </span>
                  <input
                    className="input mt-1"
                    type="email"
                    placeholder="Optional"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary w-full justify-center"
                  disabled={busy || !personName.trim()}
                  onClick={createPartner}
                >
                  {busy ? "Adding…" : "Next"} <IconArrowRight size={14} />
                </button>
              </div>
            )}

            <p className="text-center text-xs text-ink-muted">
              Truly nobody yet?{" "}
              <Link href="/" className="link !text-xs">
                Skip this and show a lender a sample portal instead
              </Link>
            </p>
          </>
        )}

        {step === 2 && partner && (
          <>
            <div className="card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-brand-light text-brand grid place-items-center shrink-0">
                  <IconUsers size={17} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{partner.name} is added</p>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Now add the clients they&apos;ve sent you. Type them in, paste a list, or drop
                    in old EOIs and let them read themselves.
                  </p>
                </div>
              </div>
              <BackfillButton
                partners={[partner]}
                onDone={() => {
                  loadCounts();
                  setStep(3);
                }}
                className="btn-primary w-full justify-center"
                label="Add what they've sent me"
              />
              <p className="text-[11px] text-ink-muted">
                Imported deals are marked as history, so they never distort your speed numbers —
                a deal you log today but quoted last spring won&apos;t report as taking months.
              </p>
            </div>

            <button
              type="button"
              className="btn-ghost w-full justify-center text-sm"
              onClick={() => {
                loadCounts();
                setStep(3);
              }}
            >
              Nothing to add yet — skip
            </button>
          </>
        )}

        {step === 3 && (
          <>
            {counts && counts.leads > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { v: String(counts.leads), l: "Referrals on file" },
                    {
                      v: counts.leads > 0 ? `${Math.round((counts.bound / counts.leads) * 100)}%` : "—",
                      l: "Close ratio",
                    },
                    {
                      v: counts.premium > 0 ? `$${Math.round(counts.premium).toLocaleString()}` : "$0",
                      l: "Premium written",
                    },
                  ].map((t) => (
                    <div key={t.l} className="card px-4 py-3">
                      <p className="tabnum text-xl font-semibold tracking-tight">{t.v}</p>
                      <p className="text-[11px] text-ink-muted mt-0.5">{t.l}</p>
                    </div>
                  ))}
                </div>
                <div className="card p-5 space-y-2">
                  <p className="font-semibold text-sm flex items-center gap-2">
                    <IconZap size={15} className="text-brand" /> What to do with this
                  </p>
                  <p className="text-sm text-ink-secondary">
                    That close ratio is the number a loan officer actually cares about — it&apos;s
                    the odds their buyer gets covered without drama. Send {partner?.name} their
                    portal link so they can watch the next one live, and use the sample portal on
                    your dashboard when you talk to someone new.
                  </p>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {partner && (
                      <Link href={`/partner/${partner.id}`} className="btn-primary !py-2 text-xs">
                        Open {partner.name}
                      </Link>
                    )}
                    <Link href="/" className="btn-ghost !py-2 text-xs">
                      Go to my dashboard
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div className="card p-6 text-center space-y-3">
                <p className="font-semibold">You&apos;re set up</p>
                <p className="text-sm text-ink-secondary max-w-sm mx-auto">
                  {partner?.name} is on your board. The moment they send you someone, log it here
                  and they can follow it live.
                </p>
                <Link href="/" className="btn-primary !py-2 text-sm inline-flex">
                  Go to my dashboard <IconArrowRight size={14} />
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
