"use client";

import { useEffect, useState } from "react";

// The upgrade moment, in one place.
//
// There are now three of these — a second partner, a second lead source, and
// the one that matters most: a client who has sent two deals and is waiting on
// a portal. They should read identically, because they are the same sentence
// said three ways: the product already did something for you, here is the part
// that keeps doing it.
//
// Never a toll booth. Every one of these fires AFTER the thing it is charging
// for has already proved itself.

export function useBillingLinks() {
  const [links, setLinks] = useState<{ founder?: string; pro?: string }>({});
  useEffect(() => {
    fetch("/api/billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.links && setLinks(b.links))
      .catch(() => {});
  }, []);
  return links;
}

export function UpgradeLinks({ compact }: { compact?: boolean }) {
  const links = useBillingLinks();
  if (!links.founder && !links.pro) {
    return (
      <a href="/billing" className={compact ? "btn-primary !py-1.5 !px-3 text-xs" : "btn-primary w-full"}>
        See plans
      </a>
    );
  }
  return (
    <div className={compact ? "flex items-center gap-2 flex-wrap" : "space-y-2"}>
      {links.founder && (
        <a
          href={links.founder}
          className={compact ? "btn-primary !py-1.5 !px-3 text-xs" : "btn-primary w-full"}
        >
          Founding member — $199/year
        </a>
      )}
      {links.pro && (
        <a
          href={links.pro}
          className={
            compact
              ? "btn-ghost !py-1.5 !px-3 text-xs"
              : links.founder
                ? "btn-ghost w-full"
                : "btn-primary w-full"
          }
        >
          Pro — $20/month
        </a>
      )}
    </div>
  );
}

export function UpgradeModal({
  kicker,
  title,
  children,
  footnote,
  onClose,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
  footnote?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">
          {kicker}
        </p>
        <h3 className="text-lg font-bold tracking-tight mt-1">{title}</h3>
        <div className="text-sm text-ink-secondary mt-2 leading-relaxed">{children}</div>
        <div className="mt-4">
          <UpgradeLinks />
        </div>
        <button className="btn-ghost w-full mt-2" onClick={onClose}>
          Not yet
        </button>
        <p className="text-[11px] text-ink-muted mt-3 text-center">
          {footnote ?? "Everything you already have stays exactly where it is."}
        </p>
      </div>
    </div>
  );
}
