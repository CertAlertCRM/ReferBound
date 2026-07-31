"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KINDS_PARTNER, PARTNER_DOC_KINDS } from "@/lib/config";
import { formatPhoneInput } from "@/lib/format";
import { IconZap, IconUpload, IconX, IconMail } from "../../icons";

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

const EXTRACTABLE = /\.(pdf|png|jpe?g)$/i;

export function PartnerSubmitForm({
  token,
  partnerType = "lender",
  contacts = [],
}: {
  token: string;
  partnerType?: string;
  contacts?: { id: string; name: string; role: string | null }[];
}) {
  const isLender = partnerType === "lender";
  const [open, setOpen] = useState(false);
  // Who on the team is sending this? Remembered per device.
  const [senderId, setSenderId] = useState<string>("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderSms, setSenderSms] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`rb_sender_${token}`);
      if (saved && contacts.some((c) => c.id === saved)) setSenderId(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const [form, setForm] = useState({ ...EMPTY });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const router = useRouter();

  async function runPrefill(file: File) {
    setPrefilling(true);
    setPrefillNote(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/p/${token}/prefill`, { method: "POST", body: fd });
    setPrefilling(false);
    if (!res.ok) {
      setPrefillNote("Couldn't auto-read that document — no problem, fill in the details below.");
      return;
    }
    const { fields } = await res.json();
    const filled: string[] = [];
    setForm((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) {
        const v = fields?.[key];
        if (v && !next[key]) {
          next[key] = String(v);
          filled.push(key.replace(/_/g, " "));
        }
      }
      return next;
    });
    setPrefillNote(
      filled.length > 0
        ? `✓ Filled from ${file.name}: ${filled.join(", ")} — please double-check before sending.`
        : `Read ${file.name} but didn't find new details — fill in the form below.`
    );
  }

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [
      ...prev,
      ...picked.map((file) => ({ file, kind: isLender ? "loan_1003" : "other" })),
    ]);
    e.target.value = "";
    // Auto-fill from the first readable document if the form is still fresh.
    const candidate = picked.find((f) => EXTRACTABLE.test(f.name));
    if (candidate && !form.client_name) runPrefill(candidate);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProgress("Sending referral…");

    const senderPayload =
      senderId && senderId !== "new"
        ? { sender_contact_id: senderId }
        : senderName.trim() && senderEmail.trim()
          ? {
              sender_name: senderName,
              sender_email: senderEmail,
              sender_phone: senderPhone || undefined,
              sender_sms_opt_in: senderSms,
            }
          : {};
    const res = await fetch(`/api/p/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...senderPayload }),
    });
    try {
      if (senderId && senderId !== "new") window.localStorage.setItem(`rb_sender_${token}`, senderId);
    } catch {}
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
    setPrefillNote(null);
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
        <div className="text-center py-6 space-y-1.5">
          <p className="text-emerald-700 font-semibold">Sent ✓ — thank you!</p>
          <p className="text-xs text-ink-secondary inline-flex items-center gap-1 flex-wrap justify-center">
            Tip: tap{" "}
            <span className="font-semibold inline-flex items-center gap-1">
              <IconMail size={12} /> Intro email
            </span>{" "}
            on the new card below to connect your client and the agent in one step.
          </p>
        </div>
      ) : (
        <>
          {/* Docs-first: the fast lane */}
          <div className="rounded-xl border border-dashed border-brand-200 bg-brand-light/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-brand-800 flex items-center gap-1.5">
              <IconZap size={15} className="shrink-0" />
              <span>
                Fastest way:{" "}
                {isLender
                  ? "upload the 1003 (or any client doc) and we'll fill this form for you"
                  : "have a document with the client's details? Upload it and we'll fill this form for you"}
              </span>
            </p>
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{f.file.name}</span>
                {isLender && (
                  <select
                    className="input !w-auto !py-1.5 text-xs"
                    value={f.kind}
                    onChange={(e) =>
                      setFiles(files.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))
                    }
                  >
                    {PARTNER_DOC_KINDS.map((k) => (
                      <option key={k} value={k}>{DOC_KINDS_PARTNER[k]}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="text-ink-muted hover:text-red-600 transition-colors"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label="Remove file"
                >
                  <IconX size={14} />
                </button>
              </div>
            ))}
            <label className="btn-ghost cursor-pointer !py-2 text-xs">
              <IconUpload size={13} />
              {prefilling
                ? "Reading document…"
                : files.length > 0
                ? "Add another file"
                : isLender
                ? "Upload 1003 / HOI request / other docs"
                : "Upload a document (optional)"}
              <input
                type="file"
                className="hidden"
                multiple
                onChange={addFiles}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                disabled={prefilling}
              />
            </label>
            {prefillNote && <p className="text-xs text-ink-secondary">{prefillNote}</p>}
          </div>

          {/* Manual fields — type-aware */}
          <p className="section-label pt-1">{files.length > 0 ? "Confirm the details" : "Or enter the details"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Client name *"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              required
            />
            {isLender && (
              <input
                className="input"
                placeholder="Co-borrower name (optional)"
                value={form.coborrower_name}
                onChange={(e) => setForm({ ...form, coborrower_name: e.target.value })}
              />
            )}
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
            {isLender && (
              <label className="block text-xs text-ink-muted">
                Closing date
                <input
                  type="date"
                  className="input mt-1"
                  value={form.closing_date}
                  onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
                />
              </label>
            )}
          </div>
          <input
            className="input"
            placeholder={isLender ? "Property address (street, city, state, zip)" : "Client address (street, city, state, zip)"}
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

          {/* Who's sending — routes updates on this client to the right person */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <p className="text-xs font-semibold text-ink-secondary">
              Who&apos;s sending this referral?{" "}
              <span className="font-normal text-ink-muted">Updates on this client go to you directly.</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <select
                className="input !py-2 text-sm"
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
              >
                <option value="">Whole team</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.role ? ` — ${c.role}` : ""}
                  </option>
                ))}
                <option value="new">I&apos;m not listed — add me</option>
              </select>
              {senderId === "new" && (
                <div className="grid grid-cols-1 gap-2.5 sm:col-span-1">
                  <input
                    className="input !py-2 text-sm"
                    placeholder="Your name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                  />
                  <input
                    className="input !py-2 text-sm"
                    type="email"
                    placeholder="Your email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                  />
                  <input
                    className="input !py-2 text-sm"
                    type="tel"
                    placeholder="Mobile (optional, for texts)"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(formatPhoneInput(e.target.value))}
                  />
                </div>
              )}
            </div>
            {senderId === "new" && senderPhone && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-brand"
                  checked={senderSms}
                  onChange={(e) => setSenderSms(e.target.checked)}
                />
                <span className="text-[11px] text-ink-secondary">
                  Text me when my referrals are quoted and when documents are ready. Msg &amp; data
                  rates may apply; reply STOP anytime to opt out.
                </span>
              </label>
            )}
          </div>

          <button className="btn-primary w-full" disabled={busy || prefilling || !form.client_name.trim()}>
            {busy ? progress || "Sending…" : "Send referral"}
          </button>
        </>
      )}
    </form>
  );
}
