"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STATUS_LABELS, STATUSES } from "@/lib/config";
import { IconAlert } from "./icons";
import { FeedbackWidget } from "./feedback-widget";

// ── Status colors: dot + tinted pill, label always present ──────────────────
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  new: { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  quoting: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  quoted: { pill: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  application: { pill: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  bound: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  docs_delivered: { pill: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  lost: { pill: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.new;
  return (
    <span className={`badge ${s.pill}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function AtRiskBadge() {
  return (
    <span className="badge bg-red-50 text-red-700">
      <IconAlert size={11} />
      Closing soon
    </span>
  );
}

// ── Segmented pipeline progress bar ──────────────────────────────────────────
export function StatusProgress({ status }: { status: string }) {
  if (status === "lost") {
    return (
      <div className="flex gap-1 items-center" aria-label="Not written">
        {STATUSES.map((s) => (
          <div key={s} className="seg opacity-60" />
        ))}
      </div>
    );
  }
  const idx = STATUSES.indexOf(status as (typeof STATUSES)[number]);
  const done = status === "bound" || status === "docs_delivered";
  return (
    <div className="flex gap-1 items-center" aria-label={STATUS_LABELS[status] ?? status}>
      {STATUSES.map((s, i) => (
        <div key={s} className={`seg ${i <= idx ? (done ? "seg-done" : "seg-filled") : ""}`} />
      ))}
    </div>
  );
}

// ── Wordmark & navigation ────────────────────────────────────────────────────
export function Wordmark({ size = "text-lg" }: { size?: string }) {
  return (
    <span className={`font-bold tracking-tight ${size} inline-flex items-center gap-2`}>
      <span>
        Refer<span className="text-brand">Bound</span>
      </span>
      <span className="live-dot" aria-hidden />
    </span>
  );
}

export function TopNav({
  active,
}: {
  active?: "referrals" | "partners" | "stats" | "profile" | "billing" | "admin";
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    // Cheap authorization ping — only the founder account gets the Admin tab.
    fetch("/api/admin/summary?ping=1").then((r) => setIsAdmin(r.ok)).catch(() => {});
  }, []);
  const tab = (href: string, key: string, label: string) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active === key ? "bg-brand-light text-brand-700" : "text-ink-secondary hover:text-ink hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <>
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200/80">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1">
          {tab("/", "referrals", "Referrals")}
          {tab("/partners", "partners", "Partners")}
          {tab("/stats", "stats", "Stats")}
          {tab("/profile", "profile", "Profile")}
          {tab("/billing", "billing", "Billing")}
          {isAdmin && tab("/admin", "admin", "Admin")}
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors"
            title="Sign out"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
    {/* Sibling of the header — backdrop-blur would trap a fixed child inside it */}
    <FeedbackWidget source="agent" />
    </>
  );
}
