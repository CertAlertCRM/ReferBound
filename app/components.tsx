"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STATUS_LABELS, STATUSES } from "@/lib/config";
import { THEMES } from "@/lib/themes";
import { IconAlert, IconMenu, IconX, IconHome, IconUsers, IconZap, IconUser } from "./icons";
import { FeedbackWidget } from "./feedback-widget";

// ── Status colors: dot + tinted pill, label always present ──────────────────
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  new: { pill: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
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
  active?: "referrals" | "partners" | "stats" | "profile" | "billing" | "admin" | "help";
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Support view marker — set by /api/admin/impersonate, shown as an amber bar
  // so there's never ambiguity about whose account is on screen.
  const [supportView, setSupportView] = useState<string | null>(null);
  useEffect(() => {
    // Cheap authorization ping — only the founder account gets the Admin tab.
    fetch("/api/admin/summary?ping=1").then((r) => setIsAdmin(r.ok)).catch(() => {});
    const m = document.cookie.match(/(?:^|;\s*)rb_support_view=([^;]+)/);
    setSupportView(m ? decodeURIComponent(m[1]) : null);

    // Theme: apply the cached palette instantly (no flash), then confirm from
    // the profile. Palettes live in lib/themes.ts.
    const apply = (key: string | null) => {
      const t = THEMES[key ?? ""];
      const root = document.documentElement;
      if (t) for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
      else Object.keys(THEMES.default.vars).forEach((k) => root.style.removeProperty(k));
    };
    try {
      apply(window.localStorage.getItem("rb_theme"));
    } catch {}
    fetch("/api/profile")
      .then(async (r) => {
        if (!r.ok) return;
        const { profile } = await r.json();
        const key = profile?.brand_color ?? "default";
        apply(key);
        try {
          window.localStorage.setItem("rb_theme", key);
        } catch {}
      })
      .catch(() => {});
  }, []);

  // Mobile: swipe left/right in the content area to move between the four
  // main pages (same order as the bottom tab bar). Deliberately conservative —
  // ignores edge swipes (the browser owns those for back/forward), swipes over
  // inputs/tables, slow drags, and diagonal scrolls.
  useEffect(() => {
    const ORDER = ["referrals", "partners", "stats", "profile"] as const;
    const HREFS: Record<string, string> = { referrals: "/", partners: "/partners", stats: "/stats", profile: "/profile" };
    let sx = 0, sy = 0, st = 0, ok = false;
    const onStart = (e: TouchEvent) => {
      ok = false;
      if (window.innerWidth >= 768 || !active || !ORDER.includes(active as any)) return;
      const t = e.touches[0];
      if (t.clientX < 28 || t.clientX > window.innerWidth - 28) return; // browser's edge gesture
      const el = e.target as HTMLElement;
      if (el.closest("input,textarea,select,table,pre,[data-noswipe]")) return;
      sx = t.clientX; sy = t.clientY; st = Date.now(); ok = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!ok) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = Math.abs(t.clientY - sy);
      if (Date.now() - st > 500 || Math.abs(dx) < 90 || dy > 60) return;
      const i = ORDER.indexOf(active as any);
      const next = dx < 0 ? ORDER[i + 1] : ORDER[i - 1];
      if (next) window.location.href = HREFS[next];
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [active]);

  // Reserve room for the fixed bottom tab bar on small screens.
  useEffect(() => {
    document.body.classList.add("has-bottomnav");
    return () => document.body.classList.remove("has-bottomnav");
  }, []);

  async function exitSupportView() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    window.location.href = "/admin";
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const links: { href: string; key: string; label: string }[] = [
    { href: "/", key: "referrals", label: "Referrals" },
    { href: "/partners", key: "partners", label: "Partners" },
    { href: "/stats", key: "stats", label: "Stats" },
    { href: "/profile", key: "profile", label: "Profile" },
    { href: "/billing", key: "billing", label: "Billing" },
    { href: "/help", key: "help", label: "Help" },
    ...(isAdmin ? [{ href: "/admin", key: "admin", label: "Admin" }] : []),
  ];

  const tab = (href: string, key: string, label: string) => (
    <Link
      key={key}
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
    {supportView && (
      <div className="sticky top-0 z-30 bg-amber-500 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-3 flex-wrap text-center">
        <span>Support view — you&apos;re seeing {supportView}&apos;s live account</span>
        <button onClick={exitSupportView} className="underline underline-offset-2 hover:opacity-80">
          Return to my account
        </button>
      </div>
    )}
    <header className={`sticky ${supportView ? "top-8" : "top-0"} z-20 bg-white/85 backdrop-blur border-b border-slate-200/80`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" onClick={() => setMenuOpen(false)}>
          <Wordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => tab(l.href, l.key, l.label))}
          <button
            onClick={signOut}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors"
            title="Sign out"
          >
            Sign out
          </button>
        </nav>

        {/* Mobile: hamburger — every destination reachable without side-scrolling */}
        <button
          className="md:hidden p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-slate-100 transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1 shadow-lift">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                active === l.key ? "bg-brand-light text-brand-700" : "text-ink-secondary hover:text-ink hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors"
          >
            Sign out
          </button>
        </nav>
      )}
    </header>
    {/* Sibling of the header — backdrop-blur would trap a fixed child inside it */}
    <FeedbackWidget source="agent" />

    {/* Mobile bottom tab bar — thumb-reach navigation, no menu required.
        Billing / Help / Admin / Sign out stay in the hamburger. */}
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {[
          { href: "/", key: "referrals", label: "Referrals", Icon: IconHome },
          { href: "/partners", key: "partners", label: "Partners", Icon: IconUsers },
          { href: "/stats", key: "stats", label: "Stats", Icon: IconZap },
          { href: "/profile", key: "profile", label: "Profile", Icon: IconUser },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-semibold transition-colors ${
              active === t.key ? "text-brand-700" : "text-ink-muted hover:text-ink"
            }`}
          >
            <t.Icon size={19} />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
    </>
  );
}
