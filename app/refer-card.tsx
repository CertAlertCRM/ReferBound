"use client";

import { useEffect, useState } from "react";
import { IconCopy, IconCheck, IconUsers } from "./icons";

// "Give a month, get three." Shown on the billing page. Deliberately framed
// around what a free agent actually wants — the partner cap lifted — because
// a discount on $0 is not an incentive.

type Refer = {
  managed: boolean;
  code: string | null;
  link: string | null;
  earnsRewards: boolean;
  monthsPerReferral: number;
  welcomeMonths: number;
  proUntil: string | null;
  proDaysLeft: number | null;
  monthsEarned: number;
  invited: { name: string; joined: string; rewarded: boolean; needsPartner: boolean; needsLead: boolean }[];
};

export function ReferCard() {
  const [d, setD] = useState<Refer | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/refer").then(async (r) => r.ok && setD(await r.json()));
  }, []);

  if (!d || d.managed || !d.link) return null;

  async function copy() {
    await navigator.clipboard.writeText(d!.link!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const share = `I've been using ReferBound to give my lender and realtor partners a live view of every client they send me — status, documents, the works. Free to start: ${d.link}`;

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <IconUsers size={16} className="text-brand" /> Refer an agent
          </h2>
          {d.earnsRewards ? (
            <p className="text-sm text-ink-secondary mt-1">
              Send another agent your link. They start with {d.welcomeMonths} month
              {d.welcomeMonths === 1 ? "" : "s"} of Pro — and once they&apos;ve added a partner and
              logged their first lead, you get{" "}
              <span className="font-semibold text-ink">{d.monthsPerReferral} months of Pro, free</span>.
              Unlimited partners the whole time.
            </p>
          ) : (
            <p className="text-sm text-ink-secondary mt-1">
              Your link, ready to share. Any agent who uses it starts with {d.welcomeMonths} month
              {d.welcomeMonths === 1 ? "" : "s"} of Pro, so they can set up every partner they work
              with from day one instead of just one.
            </p>
          )}
        </div>
        {d.earnsRewards && d.proDaysLeft !== null && (
          <span className="badge bg-emerald-50 text-emerald-700 shrink-0">
            Pro active · {d.proDaysLeft}d left
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 break-all flex-1 min-w-0">
          {d.link}
        </code>
        <button type="button" className="btn-ghost !py-2 text-xs shrink-0" onClick={copy}>
          {copied ? <IconCheck size={13} className="text-emerald-600" /> : <IconCopy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          className="btn-ghost !py-2 text-xs shrink-0"
          href={`sms:?&body=${encodeURIComponent(share)}`}
        >
          Text it
        </a>
        <a
          className="btn-ghost !py-2 text-xs shrink-0"
          href={`mailto:?subject=${encodeURIComponent("A tool for your referral partners")}&body=${encodeURIComponent(share)}`}
        >
          Email it
        </a>
      </div>

      {d.invited.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1.5">
            Agents you&apos;ve brought in
            {d.earnsRewards && ` · ${d.monthsEarned} month${d.monthsEarned === 1 ? "" : "s"} earned`}
          </p>
          <ul className="space-y-1">
            {d.invited.map((a, i) => (
              <li key={i} className="text-xs flex items-center justify-between gap-3">
                <span className="font-medium text-ink">{a.name}</span>
                {a.rewarded ? (
                  <span className="text-emerald-700 font-medium">
                    {d.earnsRewards ? `+${d.monthsPerReferral} months earned ✓` : "up and running ✓"}
                  </span>
                ) : (
                  <span className="text-ink-muted">
                    {a.needsPartner ? "hasn't added a partner yet" : a.needsLead ? "no leads logged yet" : "almost there"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
