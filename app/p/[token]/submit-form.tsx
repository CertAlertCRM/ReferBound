"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KINDS, PARTNER_DOC_KINDS } from "@/lib/config";
import { formatPhoneInput } from "@/lib/format";

type PendingFile = { file: File; kind: string };

const EMPTY = {
  client_name: "",
  coborrower_name: "",
  client_phone: "",
  client_email: "",
  client_dob: "",
  property_address: "",
  closing_date: "",
  notes: "",
};

export function PartnerSubmitForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked.map((file) => ({ file, kind: "loan_1003" }))]);
    e.target.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProgress("Sending referral…");

    const res = await fetch(`/api/p/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setBusy(false);
      setProgress("");
      alert((await res.json()).error ?? "Something went wrong");
      return;
    }
    const { referral_id } = await res.json();

    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading document ${i + 1} of ${files.length}…`);
      const fd = new FormData();
      fd.append("file", files[i].file);
      fd.append("kind", files[i].kind);
      fd.append("referral_id", referral_id);
      const up = await fetch(`/api/p/${token}/upload`, { method: "POST", body: fd });
      if (!up.ok) {
        alert(`"${files[i].file.name}" failed to upload — you can try it again from this page later.`);
      }
    }

    setBusy(false);
    setProgress("");
    setDone(true);
    setForm({ ...EMPTY });
    setFiles([]);
    setTimeout(() => {
      setDone(false);
      setOpen(false);
      router.refresh();
    }, 2000);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Client name *"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              required
              autoFocus
            />
            <input
              className="input"
              placeholder="Co-borrower name (optional)"
              value={form.coborrower_name}
              onChange={(e) => setForm({ ...form, coborrower_name: e.target.value })}
            />
            <input
              className="input"
              type="tel"
              inputMode="tel"
              placeholder="Client phone (804-555-1234)"
              value={form.client_phone}
              onChange={(e) => setForm({ ...form, client_phone: formatPhoneInput(e.target.value) })}
            />
            <input
              className="input"
              type="email"
              inputMode="email"
              placeholder="Client email"
              value={form.client_email}
              onChange={(e) => setForm({ ...form, client_email: e.target.value })}
            />
            <label className="block text-xs text-ink-muted">
              Date of birth
              <input
                type="date"
                className="input mt-1"
                value={form.client_dob}
                onChange={(e) => setForm({ ...form, client_dob: e.target.value })}
              />
            </label>
            <label className="block text-xs text-ink-muted">
              Closing date
              <input
                type="date"
                className="input mt-1"
                value={form.closing_date}
                onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
              />
            </label>
          </div>
          <input
            className="input"
            placeholder="Property address (street, city, state, zip)"
            autoComplete="street-address"
            value={form.property_address}
            onChange={(e) => setForm({ ...form, property_address: e.target.value })}
          />
          <input
            className="input"
            placeholder="Anything we should know? (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          {/* Documents */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="section-label">Documents (optional)</p>
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{f.file.name}</span>
                <select
                  className="input !w-auto !py-1.5 text-xs"
                  value={f.kind}
                  onChange={(e) =>
                    setFiles(files.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))
                  }
                >
                  {PARTNER_DOC_KINDS.map((k) => (
                    <option key={k} value={k}>{DOC_KINDS[k]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-ink-muted hover:text-red-600"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="btn-ghost cursor-pointer !py-2 text-xs">
              + Attach files (1003, HOI request, mortgagee info…)
              <input
                type="file"
                className="hidden"
                multiple
                onChange={addFiles}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
              />
            </label>
          </div>

          <button className="btn-primary w-full" disabled={busy || !form.client_name.trim()}>
            {busy ? progress || "Sending…" : "Send referral"}
          </button>
        </>
      )}
    </form>
  );
}
