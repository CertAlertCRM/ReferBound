"use client";

import { useEffect, useState } from "react";
import type { Scope } from "@/lib/scope";

// Mine / My team / Unassigned.
//
// The rule this component exists to keep: it renders NOTHING unless the
// signed-in person is an owner with at least one producer on the account. A
// solo agent, a producer-plan subscriber, and an agency owner who hasn't added
// anyone yet all see the page exactly as they saw it yesterday. Tabs that only
// ever show one thing are worse than no tabs.
//
// Producers get no control at all — not a disabled one, not a greyed one. A
// visible-but-locked "Team" tab advertises that there is something they are
// not allowed to see, which is a strange thing to say to a colleague every
// morning. Their scope is decided on the server; the UI simply doesn't mention
// it.

export type TeamMember = { id: string; name: string };

type Props = {
  canSeeTeam: boolean;
  scope: Scope;
  onChange: (s: Scope) => void;
  // Rendered only when there are unattributed leads to deal with; the tab
  // disappears for good once the backlog is assigned.
  unassignedCount?: number;
  teamCount?: number;
};

export default function ScopeTabs({
  canSeeTeam,
  scope,
  onChange,
  unassignedCount = 0,
  teamCount = 0,
}: Props) {
  if (!canSeeTeam) return null;

  const tabs: { key: Scope; label: string; badge?: number }[] = [
    { key: "mine", label: "My leads" },
    { key: "team", label: "My team", badge: teamCount || undefined },
  ];
  if (unassignedCount > 0) {
    tabs.push({ key: "unassigned", label: "Unassigned", badge: unassignedCount });
  }

  return (
    <div
      role="tablist"
      aria-label="Whose leads to show"
      className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 shadow-inner"
    >
      {tabs.map((t) => {
        const on = scope === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={
              on
                ? "flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-btn transition"
                : "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
            }
          >
            {t.label}
            {t.badge ? (
              <span
                className={
                  on
                    ? "rounded-full bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                    : "rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700"
                }
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// Remember the tab across reloads, per person.
//
// Small thing, but an owner who works out of the team view all morning should
// not be dropped back on their own book by every navigation. Keyed by account
// so a shared machine doesn't leak a preference between logins.
export function useScope(accountKey: string, initial: Scope = "mine") {
  const storageKey = `rb.scope.${accountKey}`;
  const [scope, setScope] = useState<Scope>(initial);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "mine" || saved === "team" || saved === "unassigned") setScope(saved);
    } catch {
      // Private windows and locked-down browsers throw here. The default tab
      // is a perfectly good outcome; nothing about this is worth an error.
    }
  }, [storageKey]);

  const change = (s: Scope) => {
    setScope(s);
    try {
      window.localStorage.setItem(storageKey, s);
    } catch {}
  };

  return [scope, change] as const;
}

// The one-line label that goes under a stat tile so a number is never
// ambiguous about whose it is.
export function scopeCaption(scope: Scope, canSeeTeam: boolean): string | null {
  if (!canSeeTeam) return null;
  if (scope === "team") return "Your producers, not you";
  if (scope === "unassigned") return "Logged before the app recorded who logged it";
  return "Your own book";
}
