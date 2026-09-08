"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconCheck, IconUsers, IconX } from "./icons";
import { UpgradeModal } from "./upgrade";
import { useUI } from "./ui";

// The growth card.
//
// This sits between the greeting and the pipeline tiles because of what it
// is: not a report on work already done, but the next piece of work. Everything
// below it is the past tense.
//
// It is one card on purpose. The nav is already at six items and the last
// thing this dashboard needs is a seventh — an agent who has to go looking for
// the ask queue will not look.

type Queue = {
  id: string;
  clientName: string;
  partnerName: string | null;
  sourceKind: "partner" | "paid" | "client";
  boundDays: number | null;
  askReferral: boolean;
  askReview: boolean;
  roundOut: boolean;
  linesLabel: string;
  missing: string[];
  renewLabel: string | null;
  renewSoon: boolean;
  promise: string | null;
};

type Data = {
  earned: { total: number; earned: number; paid: number; percent: number | null };
  queue: Queue[];
  queueTotal: number;
  warming: number;
  promote: { id: string; name: string; count: number }[];
  askedCount: number;
  askedThisWeek: number;
  streakWeeks: number;
  firstEarned: { clientName: string; fromName: string | null } | null;
  multiline?: { recorded: number; multiline: number; monoline: number; percent: number | null };
  coldStart: boolean;
  // Set when the server could not read. Distinct from an empty book: the card
  // says nothing at all rather than guessing.
  unavailable?: boolean;
};

function ago(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "bound today";
  if (days === 1) return "bound yesterday";
  if (days < 30) return `bound ${days} days ago`;
  const m = Math.round(days / 30);
  return m === 1 ? "bound about a month ago" : `bound about ${m} months ago`;
}

export function GrowCard() {
  const { toast } = useUI();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  // The best upgrade moment in the product: a client has sent two, and the
  // portal that makes them a standing partner is the thing behind the wall.
  // They are not being asked to imagine a benefit — it already happened.
  const [wall, setWall] = useState<{ name: string; count: number } | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/grow");
      if (!res.ok) return;
      const j = await res.json();
      if (j?.unavailable) return;
      setD(j);
    } catch {
      // Stay silent. A growth prompt is never worth breaking the dashboard for.
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Clear a promise that came to nothing. The queue only keeps trust if the
  // producer can take something off it.
  async function clearPromise(id: string) {
    setBusy(`p-${id}`);
    await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promised_note: "" }),
    });
    setBusy(null);
    load();
  }

  async function promote(id: string) {
    setBusy(id);
    const res = await fetch("/api/grow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId: id }),
    });
    setBusy(null);
    if (res.ok) {
      load();
      return;
    }
    const err = await res.json().catch(() => ({}));
    if (res.status === 402) {
      const p = d?.promote.find((x) => x.id === id);
      setWall({ name: p?.name ?? "They", count: p?.count ?? 2 });
    } else {
      // Silence on a failed click is worse than a blunt message.
      toast(err?.error ?? "Couldn't do that just now.", "error");
    }
  }

  const wallModal = wall ? (
    <UpgradeModal
      kicker="They earned this"
      title={`${wall.name} has sent you ${wall.count}`}
      footnote="Your deals, partners and documents stay exactly where they are."
      onClose={() => setWall(null)}
    >
      <p>
        That is not a client any more — that is a referral partner, and the people who send you two
        usually send you a fourth. A partner portal gives {wall.name.split(" ")[0]} a private page
        to send the next one through and to watch it land, alongside everything you already do by
        phone.
      </p>
    </UpgradeModal>
  ) : null;

  if (!d) return wallModal;

  // Nothing written yet. One line, no zeroes — a brand-new producer staring at
  // "0% earned" learns only that the product thinks they're behind.
  if (d.coldStart) {
    return (
      <div className="card p-4 sm:p-5">
        {wallModal}
        <p className="text-sm font-semibold">Where your business comes from</p>
        <p className="text-sm text-ink-secondary mt-1">
          Once you bind your first policy, this is where you&apos;ll see how much of your book came
          from someone who sent it to you — and who you haven&apos;t asked yet.
        </p>
      </div>
    );
  }

  const promos = d.promote.filter((p) => !hidden.includes(p.id));
  const shown = open ? d.queue : d.queue.slice(0, 3);

  return (
    <div className="card overflow-hidden">
      {wallModal}

      {/* The first client who came from a client.
          Not a badge and not a score. For a producer who has never had one,
          this is the moment the idea stops being theoretical, and it can be
          two months after they start. It shows once, for the first one, and
          ages out on its own after a month. */}
      {d.firstEarned && (
        <div className="px-4 sm:px-5 py-4 bg-emerald-50 border-l-[3px] border-emerald-500 border-b border-slate-200">
          <p className="text-sm">
            <span className="font-semibold">{d.firstEarned.clientName}</span>
            {d.firstEarned.fromName ? (
              <>
                {" "}came in from{" "}
                <span className="font-semibold">{d.firstEarned.fromName}</span>.
              </>
            ) : (
              " came in from a client you already wrote."
            )}
          </p>
          <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
            That&apos;s your first client earned from an ask. Every client you write from here can
            do the same thing.
          </p>
        </div>
      )}
      {/* Promotions ride on top: they are time-sensitive in a way the queue
          isn't, and there are almost never more than one or two. */}
      {promos.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-brand-light/60 border-l-[3px] border-brand-400 border-b border-slate-200"
        >
          <IconUsers size={16} className="text-brand shrink-0" />
          <p className="text-sm min-w-0 flex-1">
            <span className="font-semibold">{p.name}</span> has sent you {p.count}. That&apos;s a
            referral partner, not a client.
          </p>
          <button
            onClick={() => promote(p.id)}
            disabled={busy === p.id}
            className="btn-primary text-xs px-3 py-1.5 shrink-0 disabled:opacity-50"
          >
            {busy === p.id ? "…" : "Make them a partner"}
          </button>
          <button
            onClick={() => setHidden((h) => [...h, p.id])}
            className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Not now"
          >
            <IconX size={14} />
          </button>
        </div>
      ))}

      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="stat stat-xl">
                {d.earned.percent === null ? "—" : `${d.earned.percent}%`}
              </p>
              <p className="text-sm font-semibold text-ink-secondary">earned</p>
            </div>
            <p className="text-xs text-ink-muted mt-2 leading-relaxed">
              {d.earned.earned} of your {d.earned.total} written{" "}
              {d.earned.total === 1 ? "policy" : "policies"} came from someone who sent it to you
              {d.earned.paid > 0 ? `, ${d.earned.paid} from leads you paid for` : ""}.
            </p>
          </div>
          <div className="shrink-0 text-right space-y-2 pl-3">
            {d.multiline && d.multiline.percent !== null && (
              <div>
                <p className="stat stat-lg">{d.multiline.percent}%</p>
                <p className="stat-label mt-1">
                  multiline
                  <br />
                  {d.multiline.monoline} on one line
                </p>
              </div>
            )}
            {d.askedCount > 0 && (
              <p className="stat-label">{d.askedCount} asked so far</p>
            )}
          </div>
        </div>
      </div>

      {d.queueTotal > 0 ? (
        <>
          <div className="px-4 sm:px-5 py-2.5 border-y border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 flex-wrap">
            <p className="section-label !text-[11px] !tracking-[0.06em] text-ink-secondary">
              {d.queueTotal} {d.queueTotal === 1 ? "client worth a call" : "clients worth a call"}
            </p>
            {/* What actually moved. Derived from the same timestamps the queue
                runs on, so there is nothing here to game. */}
            {(d.askedThisWeek > 0 || d.streakWeeks >= 2) && (
              <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
                {d.askedThisWeek > 0 && (
                  <span>
                    <span className="font-semibold text-ink-secondary">{d.askedThisWeek}</span> asked
                    this week
                  </span>
                )}
                {d.askedThisWeek > 0 && d.streakWeeks >= 2 && <span>·</span>}
                {d.streakWeeks >= 2 && <span>{d.streakWeeks} weeks running</span>}
              </p>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {shown.map((q) =>
              q.promise ? (
                <li
                  key={q.id}
                  className="flex items-start gap-3 px-4 sm:px-5 py-3.5 bg-amber-50/70 border-l-[3px] border-amber-400"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{q.clientName}</span> said they&apos;d tell{" "}
                      <span className="font-semibold text-amber-900">{q.promise}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="chip chip-warn">nobody has logged them</span>
                      <span className="chip chip-neutral">{ago(q.boundDays)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/?from=${q.id}&name=${encodeURIComponent(q.promise)}`}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      Log them
                    </Link>
                    <button
                      onClick={() => clearPromise(q.id)}
                      disabled={busy === `p-${q.id}`}
                      className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors"
                      aria-label="Nothing came of it"
                      title="Nothing came of it"
                    >
                      <IconX size={14} />
                    </button>
                  </div>
                </li>
              ) : (
              <li key={q.id}>
                {/* Straight to the block they clicked for. Landing at the top
                    of a long file makes them re-decide something they already
                    decided on the dashboard. */}
                <Link href={`/deal/${q.id}?focus=reps`} className="row-link">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <p className="text-sm font-semibold truncate">{q.clientName}</p>
                      <span className="text-[11px] text-ink-muted shrink-0">
                        {ago(q.boundDays)}
                      </span>
                    </div>
                    {/* Why this person is on the list. One call, and these are
                        the things to cover on it. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {q.askReferral && <span className="chip chip-brand">not asked yet</span>}
                      {q.roundOut && (
                        <span className={`chip ${q.renewSoon ? "chip-warn" : "chip-neutral"}`}>
                          {q.linesLabel ? `${q.linesLabel} only` : "one line only"}
                          {q.missing.length > 0 ? ` — try ${q.missing.join(" or ")}` : ""}
                        </span>
                      )}
                      {q.renewLabel && (
                        <span className={`chip ${q.renewSoon ? "chip-warn" : "chip-neutral"}`}>
                          {q.renewLabel}
                        </span>
                      )}
                      {!q.askReferral && !q.roundOut && (
                        <span className="chip chip-neutral">ready for a review ask</span>
                      )}
                      {q.sourceKind === "paid" && (
                        <span className="chip chip-neutral">paid lead</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-brand-700 shrink-0">
                    {q.askReferral ? "Ask" : q.roundOut ? "Round out" : "Review"}
                  </span>
                  <IconArrowRight size={14} className="text-ink-muted shrink-0" />
                </Link>
              </li>
              )
            )}
          </ul>
          {d.queueTotal > 3 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="w-full px-4 sm:px-5 py-2.5 text-xs font-semibold text-ink-secondary hover:text-ink hover:bg-slate-50 border-t border-slate-100 transition-colors"
            >
              {open
                ? "Show fewer"
                : `Show ${Math.min(d.queue.length, d.queueTotal) - 3} more${
                    d.queueTotal > d.queue.length ? ` of ${d.queueTotal}` : ""
                  }`}
            </button>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-emerald-50/40">
          <IconCheck size={15} className="text-emerald-600 shrink-0" />
          <p className="text-xs text-ink-secondary">
            {d.askedThisWeek > 0 ? `${d.askedThisWeek} asked this week. ` : ""}
            Everyone you&apos;ve bound has been asked.
            {d.warming > 0
              ? ` ${d.warming} just bound — give them a few days with their documents first.`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
