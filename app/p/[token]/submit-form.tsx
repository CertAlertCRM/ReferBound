"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PartnerSubmitForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_name: "", client_phone: "", closing_date: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/p/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setForm({ client_name: "", client_phone: "", closing_date: "", notes: "" });
      setTimeout(() => {
        setDone(false);
        setOpen(false);
        router.refresh();
      }, 1800);
    } else {
      alert((await res.json()).error ?? "Something went wrong");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary w-full !py-3">
        + Send a new referral
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">New referral</h2>
        <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {done ? (
        <p className="text-emerald-700 font-semibold text-center py-6">Sent ✓ — thank you!</p>
      ) : (
        <>
          <input
            className="input"
            placeholder="Client name *"
            value={form.client_name}
            onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            required
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Client phone"
              value={form.client_phone}
              onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
            />
            <input
              type="date"
              className="input"
              value={form.closing_date}
              onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
              title="Closing date (if known)"
            />
          </div>
          <input
            className="input"
            placeholder="Anything we should know? (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button className="btn-primary w-full" disabled={busy || !form.client_name}>
            {busy ? "Sending…" : "Send referral"}
          </button>
        </>
      )}
    </form>
  );
}
