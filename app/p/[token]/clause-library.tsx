"use client";

import { useEffect, useState } from "react";
import { IconUpload, IconCheck, IconCopy, IconTrash, IconSparkles, IconX } from "../../icons";

// The processor's clause library, inside their own portal.
//
// A processor already keeps this list — on a laminated sheet, a spreadsheet
// tab, or a wiki page. The entire design goal is that they hand that over once
// and never type it again. Upload the sheet, glance at what came back, save.
//
// The one place friction is deliberate: every parsed clause is shown for review
// before it saves. A mortgagee clause gets a file kicked back over one wrong
// word, and no processor should have to trust an AI transcription they haven't
// laid eyes on.

type Clause = {
  id: string;
  label: string;
  clause: string;
  investor: string | null;
  loan_types: string[];
  notes: string | null;
  is_default: boolean;
};

type Candidate = {
  label: string;
  clause: string;
  investor?: string | null;
  loan_types?: string[];
  notes?: string | null;
};

export function ClauseLibrary({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [reqs, setReqs] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"clauses" | "requirements">("clauses");
  const [paste, setPaste] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/p/${token}/clauses`);
    if (!r.ok) return;
    const j = await r.json();
    setClauses(j.clauses ?? []);
    const latestReq = (j.files ?? []).find((f: any) => f.kind === "requirements");
    setReqs(latestReq?.parsed ?? null);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function parse(file?: File | null) {
    setBusy(true);
    setError("");
    const fd = new FormData();
    if (file) fd.append("file", file);
    if (paste.trim()) fd.append("text", paste);
    fd.append("kind", mode === "requirements" ? "requirements" : "clause_list");

    const res = await fetch(`/api/p/${token}/clauses`, { method: "PUT", body: fd });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't read that");
      return;
    }
    const j = await res.json();
    if (mode === "requirements") {
      setReqs(j.requirements);
      setPaste("");
      load();
    } else {
      setCandidates(j.candidates ?? []);
    }
  }

  async function saveCandidates() {
    if (!candidates?.length) return;
    setBusy(true);
    const res = await fetch(`/api/p/${token}/clauses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clauses: candidates }),
    });
    setBusy(false);
    if (res.ok) {
      setCandidates(null);
      setPaste("");
      load();
    } else setError((await res.json()).error ?? "Couldn't save");
  }

  async function act(action: "delete" | "default", id: string) {
    await fetch(`/api/p/${token}/clauses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    load();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="link !text-xs"
        onClick={() => setOpen(true)}
      >
        {clauses.length > 0
          ? `Your mortgagee clauses (${clauses.length})`
          : "Import your mortgagee clause list"}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Your clauses &amp; requirements</p>
          <p className="text-[11px] text-ink-secondary mt-0.5 max-w-lg">
            Upload the sheet you already keep — spreadsheet, PDF, or a photo of the printed one.
            We&apos;ll read it, and from then on the right clause lands on each file on its own.
          </p>
        </div>
        <button type="button" className="text-ink-muted hover:text-ink shrink-0" onClick={() => setOpen(false)}>
          <IconX size={16} />
        </button>
      </div>

      <div className="flex gap-1">
        {(["clauses", "requirements"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setCandidates(null);
              setError("");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              mode === m ? "bg-brand text-white" : "text-ink-secondary hover:bg-white"
            }`}
          >
            {m === "clauses" ? "Mortgagee clauses" : "Insurance requirements"}
          </button>
        ))}
      </div>

      {/* Existing library */}
      {mode === "clauses" && clauses.length > 0 && !candidates && (
        <ul className="space-y-1.5">
          {clauses.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                    {c.label}
                    {c.is_default && (
                      <span className="badge bg-brand-light text-brand !text-[10px]">default</span>
                    )}
                    {c.loan_types.map((t) => (
                      <span key={t} className="badge bg-slate-100 text-ink-muted !text-[10px]">
                        {t}
                      </span>
                    ))}
                  </p>
                  <p className="text-[11px] text-ink-secondary whitespace-pre-line mt-1">{c.clause}</p>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="text-ink-muted hover:text-brand"
                    title="Copy exact wording"
                    onClick={async () => {
                      await navigator.clipboard.writeText(c.clause);
                      setCopied(c.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === c.id ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  </button>
                  {!c.is_default && (
                    <button
                      type="button"
                      className="link !text-[10px] whitespace-nowrap"
                      onClick={() => act("default", c.id)}
                    >
                      make default
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-ink-muted hover:text-red-600"
                    onClick={() => act("delete", c.id)}
                    title="Remove"
                  >
                    <IconTrash size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Review before save */}
      {candidates && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
            Read these before saving — a clause is rejected at closing over one wrong word, so
            we&apos;d rather you check than trust us.
          </p>
          {candidates.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
              <input
                className="input !py-1.5 text-xs font-semibold"
                value={c.label}
                onChange={(e) => {
                  const next = [...candidates];
                  next[i] = { ...c, label: e.target.value };
                  setCandidates(next);
                }}
              />
              <textarea
                className="input !py-1.5 !text-[11px] min-h-[80px] font-sans"
                value={c.clause}
                onChange={(e) => {
                  const next = [...candidates];
                  next[i] = { ...c, clause: e.target.value };
                  setCandidates(next);
                }}
              />
              <button
                type="button"
                className="link !text-[10px]"
                onClick={() => setCandidates(candidates.filter((_, j) => j !== i))}
              >
                remove this one
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" disabled={busy} onClick={saveCandidates}>
              {busy ? "Saving…" : `Save ${candidates.length} clause${candidates.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setCandidates(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Requirements summary */}
      {mode === "requirements" && reqs && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold">On file</p>
          <p className="text-[11px] text-ink-secondary mt-1">{reqs.summary ?? "Saved."}</p>
          <ul className="text-[11px] text-ink-secondary mt-1.5 space-y-0.5">
            {reqs.min_liability && <li>Minimum liability: {reqs.min_liability}</li>}
            {reqs.max_wind_deductible && <li>Max wind/hail deductible: {reqs.max_wind_deductible}</li>}
            {reqs.max_aop_deductible && <li>Max all-other-perils deductible: {reqs.max_aop_deductible}</li>}
            {reqs.flood_required && <li>Flood: {reqs.flood_required}</li>}
            {(reqs.conditions ?? []).map((c: string, i: number) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="text-[10px] text-ink-muted mt-2">
            Every policy is checked against these before documents go out.
          </p>
        </div>
      )}

      {/* Import */}
      {!candidates && (
        <div className="space-y-2">
          <label className="btn-ghost !py-2 text-xs cursor-pointer inline-flex">
            <IconUpload size={13} />
            {busy ? "Reading…" : mode === "clauses" ? "Upload your clause sheet" : "Upload your requirements"}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.txt"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) parse(f);
              }}
            />
          </label>
          <p className="text-[11px] text-ink-muted">or paste it:</p>
          <textarea
            className="input !py-2 !text-xs min-h-[80px] font-sans"
            placeholder={
              mode === "clauses"
                ? "Paste your clause list — any format, we'll sort it out"
                : "Paste your insurance requirements"
            }
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3 text-xs"
            disabled={busy || !paste.trim()}
            onClick={() => parse(null)}
          >
            <IconSparkles size={13} /> {busy ? "Reading…" : "Read this"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
