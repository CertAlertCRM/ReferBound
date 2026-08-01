"use client";

import { useState } from "react";
import { IconCalendar, IconCheck } from "../../icons";

// "The closing moved."
//
// Three taps from the file the processor is already looking at. Deliberately
// small and inline — this is a correction, not a form, and anything heavier
// gets skipped in favour of an email the agent may or may not read in time.

export function ClosingDateEdit({
  token,
  referralId,
  current,
  senderName,
}: {
  token: string;
  referralId: string;
  current: string | null;
  senderName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/p/${token}/closing-date`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: referralId, closing_date: date, note, by: senderName }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setOpen(false);
      setTimeout(() => window.location.reload(), 1200);
    } else setError((await res.json()).error ?? "Couldn't update that");
  }

  if (done) {
    return (
      <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
        <IconCheck size={12} /> Updated — thank you
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className="link !text-[11px]" onClick={() => setOpen(true)}>
        <IconCalendar size={11} /> Closing date changed?
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <p className="text-[11px] text-ink-secondary">
        New closing date. This updates their board straight away — especially useful when it moves
        up, since that&apos;s the one nobody finds out about in time.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="date"
          className="input !py-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          autoFocus
        />
        <input
          className="input !py-2 text-sm"
          placeholder="Anything to add? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary !py-1.5 !px-3 text-xs"
          disabled={busy || !date}
          onClick={save}
        >
          {busy ? "Updating…" : "Update the date"}
        </button>
        <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
