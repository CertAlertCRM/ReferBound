"use client";

import { useState } from "react";
import { IconZap } from "./icons";

// Agent-side docs-first box: drop the loan document an LO emailed you, the lead form
// fills itself. The file is held and attached to the referral after creation.

const EXTRACTABLE = /\.(pdf|png|jpe?g)$/i;

export function LeadPrefillBox({
  onFields,
  onFile,
}: {
  onFields: (fields: Record<string, string>) => void;
  onFile: (file: File | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    onFile(file);
    if (!EXTRACTABLE.test(file.name)) {
      setNote(`Attached ${file.name} — can't auto-read that type, fill the form below.`);
      return;
    }
    setBusy(true);
    setNote(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/prefill", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      setNote("Couldn't auto-read that document — no problem, fill in the details below.");
      return;
    }
    const { fields } = await res.json();
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields ?? {})) {
      if (v) clean[k] = String(v);
    }
    onFields(clean);
    const got = Object.keys(clean).map((k) => k.replace(/_/g, " "));
    setNote(
      got.length > 0
        ? `✓ Filled from ${file.name}: ${got.join(", ")} — double-check before saving.`
        : `Read ${file.name} but didn't find details — fill in the form below.`
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-light/40 p-3.5">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800">
          <IconZap size={15} /> Fastest way: drop the loan document (or any client doc)
        </span>
        <span className="btn-ghost !py-1.5 !px-3 text-xs shrink-0 ml-auto">
          {busy ? "Reading…" : fileName ? "Replace file" : "Choose file"}
        </span>
        <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={pick} disabled={busy} />
      </label>
      {note && <p className="text-xs text-ink-secondary mt-2">{note}</p>}
      {fileName && !note?.startsWith("Couldn") && (
        <p className="text-[11px] text-ink-muted mt-1">{fileName} will be attached to the lead automatically.</p>
      )}
    </div>
  );
}
