"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconSparkles, IconUpload, IconAlert } from "../../icons";
import { useUI } from "../../ui";

// The lender's requirements, edited by the lender.
//
// The agent used to keep this — typing from memory what a processor enforces
// for a living. That works until an investor changes or a cap moves, at which
// point the agent is the last to find out and the first to send an evidence of
// insurance that comes back. So it moved here.
//
// Deliberately collapsed by default. A loan officer opening this portal wants
// to see their clients, not a settings form. The panel announces whether
// anything is on file and gets out of the way.

type Req = {
  mortgagee_clause: string | null;
  min_liability: string | null;
  max_wind_deductible: string | null;
  max_aop_deductible: string | null;
  replacement_cost_required: boolean | null;
  flood_required: string | null;
  escrow_notes: string | null;
  conditions: string[];
  notes: string | null;
  summary: string | null;
  _source?: string | null;
  _updated_at?: string | null;
  _updated_by?: string | null;
};

const BLANK: Req = {
  mortgagee_clause: "",
  min_liability: "",
  max_wind_deductible: "",
  max_aop_deductible: "",
  replacement_cost_required: null,
  flood_required: "",
  escrow_notes: "",
  conditions: [],
  notes: "",
  summary: null,
} as any;

function onFile(r: Req | null): boolean {
  if (!r) return false;
  return Boolean(
    r.mortgagee_clause ||
      r.min_liability ||
      r.max_wind_deductible ||
      r.max_aop_deductible ||
      r.replacement_cost_required != null ||
      r.flood_required ||
      r.escrow_notes ||
      (r.conditions ?? []).length ||
      r.notes
  );
}

export function RequirementsPanel({ token, agentName }: { token: string; agentName: string }) {
  const { toast } = useUI();
  const [saved, setSaved] = useState<Req | null>(null);
  const [form, setForm] = useState<Req>(BLANK);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [by, setBy] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [review, setReview] = useState(false);

  async function load() {
    const r = await fetch(`/api/p/${token}/requirements`);
    if (!r.ok) return;
    const j = await r.json();
    setSaved(j.requirements ?? null);
    if (j.requirements) setForm({ ...BLANK, ...j.requirements });
  }
  useEffect(() => {
    load();
  }, [token]);

  function set<K extends keyof Req>(k: K, v: Req[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/p/${token}/requirements`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirements: form, by: by.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Couldn't save that", "error");
      return;
    }
    const j = await res.json();
    setSaved(j.requirements);
    setEditing(false);
    setReview(false);
    toast("Saved — every proof of insurance gets checked against this");
  }

  async function readSheet(fd: FormData) {
    setBusy(true);
    const res = await fetch(`/api/p/${token}/requirements`, { method: "POST", body: fd });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(j.error ?? "Couldn't read that", "error");
      return;
    }
    setForm({ ...BLANK, ...j.requirements });
    setEditing(true);
    setReview(true);
    setPasteOpen(false);
    setPaste("");
  }

  const has = onFile(saved);

  return (
    <section className="card p-5 space-y-3">
      <button
        type="button"
        className="w-full flex items-start justify-between gap-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0">
          <span className="font-semibold text-sm flex items-center gap-2 flex-wrap">
            Your insurance requirements
            {has ? (
              <span className="badge bg-emerald-50 text-emerald-700">on file</span>
            ) : (
              <span className="badge bg-amber-50 text-amber-700">not set</span>
            )}
          </span>
          <span className="text-xs text-ink-muted block mt-0.5">
            {has
              ? `${agentName} checks every proof of insurance against these before sending it.`
              : `Set these once and ${agentName} checks every proof of insurance against them before sending.`}
          </span>
        </span>
        <span className="link !text-xs shrink-0">{open ? "Hide" : has ? "Review" : "Set them"}</span>
      </button>

      {open && (
        <>
          {!editing && (
            <>
              {has ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                  {saved?.mortgagee_clause && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        Mortgagee clause
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{saved.mortgagee_clause}</p>
                    </div>
                  )}
                  <ul className="text-sm text-ink-secondary space-y-1">
                    {saved?.min_liability && <li>Minimum liability — {saved.min_liability}</li>}
                    {saved?.max_wind_deductible && (
                      <li>Wind/hail deductible no more than {saved.max_wind_deductible}</li>
                    )}
                    {saved?.max_aop_deductible && (
                      <li>All-other-perils deductible no more than {saved.max_aop_deductible}</li>
                    )}
                    {saved?.replacement_cost_required === true && <li>Replacement cost required</li>}
                    {saved?.flood_required && <li>Flood — {saved.flood_required}</li>}
                    {saved?.escrow_notes && <li>Escrow — {saved.escrow_notes}</li>}
                    {(saved?.conditions ?? []).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                    {saved?.notes && <li>{saved.notes}</li>}
                  </ul>
                  {saved?._updated_at && (
                    <p className="text-[11px] text-ink-muted pt-1">
                      Last updated{" "}
                      {new Date(saved._updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {saved._updated_by ? ` by ${saved._updated_by}` : ""}
                      {saved._source === "agent" ? ` · entered by ${agentName}` : ""}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Nothing on file yet. If your team has a requirements sheet, upload it and
                  we&apos;ll read it — you review every line before it saves. Or type the few that
                  actually get files kicked back.
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className={has ? "btn-ghost !py-1.5 !px-3 text-xs" : "btn-primary !py-1.5 !px-3 text-xs"}
                  onClick={() => setEditing(true)}
                >
                  {has ? "Update them" : "Set them"}
                </button>
                <label className="btn-ghost !py-1.5 !px-3 text-xs cursor-pointer">
                  <IconUpload size={13} /> {busy ? "Reading…" : "Upload your sheet"}
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      const fd = new FormData();
                      fd.append("file", f);
                      readSheet(fd);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  onClick={() => setPasteOpen(!pasteOpen)}
                >
                  Paste text
                </button>
              </div>

              {pasteOpen && (
                <div className="space-y-2">
                  <textarea
                    className="input !h-28 text-sm resize-y"
                    placeholder="Paste your requirements — an email, a policy excerpt, whatever you already send agents."
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-3 text-xs"
                    disabled={busy || !paste.trim()}
                    onClick={() => {
                      const fd = new FormData();
                      fd.append("text", paste);
                      readSheet(fd);
                    }}
                  >
                    <IconSparkles size={13} /> {busy ? "Reading…" : "Read it"}
                  </button>
                </div>
              )}
            </>
          )}

          {editing && (
            <div className="space-y-3">
              {review && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <IconAlert size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Read from your sheet — check every line before saving. A requirement copied
                    wrong is worse than one left blank, because it&apos;ll be trusted.
                  </span>
                </p>
              )}

              <label className="block">
                <span className="text-xs text-ink-secondary">
                  Mortgagee clause — exactly as it must appear
                </span>
                <textarea
                  className="input mt-1 !h-20 text-sm resize-y"
                  placeholder={"Your Company ISAOA/ATIMA\nPO Box 000, City ST 00000"}
                  value={form.mortgagee_clause ?? ""}
                  onChange={(e) => set("mortgagee_clause", e.target.value)}
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-ink-secondary">Minimum liability</span>
                  <input
                    className="input mt-1 !py-2 text-sm"
                    placeholder="$300,000"
                    value={form.min_liability ?? ""}
                    onChange={(e) => set("min_liability", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-secondary">Max wind/hail deductible</span>
                  <input
                    className="input mt-1 !py-2 text-sm"
                    placeholder="2% of Coverage A"
                    value={form.max_wind_deductible ?? ""}
                    onChange={(e) => set("max_wind_deductible", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-secondary">Max all-other-perils deductible</span>
                  <input
                    className="input mt-1 !py-2 text-sm"
                    placeholder="$2,500"
                    value={form.max_aop_deductible ?? ""}
                    onChange={(e) => set("max_aop_deductible", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-secondary">
                    Flood — when is it required?
                  </span>
                  <input
                    className="input mt-1 !py-2 text-sm"
                    placeholder="Zone A or V, per the flood determination"
                    value={form.flood_required ?? ""}
                    onChange={(e) => set("flood_required", e.target.value)}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={form.replacement_cost_required === true}
                  onChange={(e) => set("replacement_cost_required", e.target.checked ? true : null)}
                />
                Replacement cost coverage required
              </label>

              <label className="block">
                <span className="text-xs text-ink-secondary">
                  Anything else that gets a file kicked back
                </span>
                <textarea
                  className="input mt-1 !h-16 text-sm resize-y"
                  placeholder="Escrow, named-insured wording, effective-date rules…"
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </label>

              {(form.conditions ?? []).length > 0 && (
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-ink-secondary">
                    Conditions read from your sheet
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {form.conditions.map((c, i) => (
                      <li key={i} className="text-[11px] text-ink-muted flex items-start gap-1.5">
                        <span>·</span>
                        <span>{c}</span>
                        <button
                          type="button"
                          className="link !text-[11px] ml-auto"
                          onClick={() =>
                            set(
                              "conditions",
                              form.conditions.filter((_, j) => j !== i)
                            )
                          }
                        >
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="block">
                <span className="text-xs text-ink-secondary">Your name (so we know who set this)</span>
                <input
                  className="input mt-1 !py-2 text-sm"
                  placeholder="Optional"
                  value={by}
                  onChange={(e) => setBy(e.target.value)}
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={save}
                >
                  <IconCheck size={13} /> {busy ? "Saving…" : "Save requirements"}
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !px-3 text-xs"
                  onClick={() => {
                    setEditing(false);
                    setReview(false);
                    setForm({ ...BLANK, ...(saved ?? {}) });
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
