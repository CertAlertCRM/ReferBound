"use client";

import { useState } from "react";
import { IconCopy, IconCheck, IconMail } from "../../icons";

// Partner-side growth loop: lenders know other lenders, and those lenders
// know other insurance agents. One card, two ways to pass ReferBound along.

export function ShareCard({ agentName, agencyName }: { agentName: string; agencyName: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = "https://referbound.com/?via=partner";

  async function copy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const subject = encodeURIComponent("This referral portal is worth a look");
  const body = encodeURIComponent(
    `Hey,\n\nMy insurance partner (${agentName} at ${agencyName}) set me up with a live portal for the clients I send over — real-time status on every referral, documents the moment policies bind, no logins, no "any update?" calls.\n\nIf you work with an insurance agent, tell them to check out ReferBound — the first partner is free:\n${shareUrl}\n\nWorth passing along.`
  );

  return (
    <div className="card p-5">
      <p className="font-semibold text-sm">Know someone who&apos;d want this?</p>
      <p className="text-xs text-ink-secondary mt-1">
        If a colleague works with an insurance agent still doing updates by text and voicemail,
        pass this along — any agent can set up a portal like this one for their partners. First
        partner is free.
      </p>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <a href={`mailto:?subject=${subject}&body=${body}`} className="btn-ghost !py-1.5 text-xs">
          <IconMail size={13} /> Share by email
        </a>
        <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={copy}>
          {copied ? <IconCheck size={13} className="text-emerald-600" /> : <IconCopy size={13} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
