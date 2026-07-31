"use client";

import { useState } from "react";
import { STATUS_LABELS, STATUSES } from "@/lib/config";
import { IconPlus, IconX, IconCheck, IconSparkles } from "./icons";

// Build-your-book: get an agent's real, in-flight referrals into ReferBound in
// minutes. Three ways in — type them, paste them, or import a file — all
// landing in the same review grid before anything is saved.

type Row = {
  client_name: string;
  partner: string;
  status: string;
  closing_date: string;
  client_phone: string;
  premium: string;
  property_address?: string;
  // Set when the row came from an uploaded document, so the file can be
  // attached to the referral once it exists.
  ref?: string;
  docKind?: string;
};

const BLANK: Row = { client_name: "", partner: "", status: "new", closing_date: "", client_phone: "", premium: "" };

export function BackfillButton({
  partners,
  onDone,
  className = "btn-ghost",
  label = "Build my book",
}: {
  partners: { id: string; name: string }[];
  onDone: () => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"type" | "paste" | "file" | "docs">("type");
  // Files from the EOI/dec upload path, keyed by row ref.
  const [pending, setPending] = useState<Record<string, File>>({});
  const [docBusy, setDocBusy] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRows] = useState<Row[]>([{ ...BLANK }, { ...BLANK }, { ...BLANK }]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);
  const [error, setError] = useState("");

  const defaultPartner = partners.length === 1 ? partners[0].name : "";

  function reset() {
    setRows([{ ...BLANK, partner: defaultPartner }, { ...BLANK, partner: defaultPartner }, { ...BLANK, partner: defaultPartner }]);
    setPaste("");
    setResult(null);
    setError("");
    setPending({});
    setDocBusy(null);
  }

  // Past EOIs / dec pages → closed deals. Processed one at a time so a folder
  // of twenty files never trips a serverless timeout, with visible progress.
  async function readDocs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setDocBusy({ done: 0, total: files.length });
    const found: Row[] = [];
    const keep: Record<string, File> = {};
    const failed: string[] = [];

    for (const [i, file] of files.entries()) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-doc", { method: "POST", body: fd });
      setDocBusy({ done: i + 1, total: files.length });
      if (!res.ok) {
        failed.push(file.name);
        continue;
      }
      const { row } = await res.json();
      if (!row?.client_name) {
        failed.push(file.name);
        continue;
      }
      const ref = `${Date.now()}-${i}`;
      keep[ref] = file;
      // Match the mortgagee to a partner the agent actually has, when it's
      // clearly the same company; otherwise leave it for them to pick.
      const guess =
        partners.find((p) => p.name.toLowerCase() === String(row.partner ?? "").toLowerCase())?.name ??
        partners.find(
          (p) =>
            row.partner &&
            (p.name.toLowerCase().includes(String(row.partner).toLowerCase().slice(0, 8)) ||
              String(row.partner).toLowerCase().includes(p.name.toLowerCase().slice(0, 8)))
        )?.name ??
        defaultPartner;
      found.push({
        client_name: row.client_name,
        partner: guess,
        // Honest default: the policy exists, so it's bound. The agent can move
        // it to "EOI & docs delivered" if the partner already has the papers.
        status: "bound",
        closing_date: row.closing_date ?? "",
        client_phone: row.client_phone ?? "",
        premium: row.premium ?? "",
        property_address: row.property_address ?? "",
        ref,
        docKind: row.doc_kind ?? "eoi",
      });
    }

    setDocBusy(null);
    setPending((p) => ({ ...p, ...keep }));
    if (!found.length) {
      setError("Couldn't read a client name from any of those. PDFs and photos of EOIs work best.");
      return;
    }
    if (failed.length) setError(`Skipped ${failed.length}: ${failed.slice(0, 3).join(", ")}`);
    setRows((rs) => [...rs.filter((r) => r.client_name.trim()), ...found, { ...BLANK, partner: defaultPartner }]);
    setTab("type");
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => {
      const next = rs.map((r, n) => (n === i ? { ...r, ...patch } : r));
      // Typing in the last row grows the grid — no "add row" clicking.
      if (i === next.length - 1 && (patch.client_name ?? "").trim()) {
        next.push({ ...BLANK, partner: next[i].partner || defaultPartner });
      }
      return next;
    });
  }

  async function runPaste() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/parse-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: paste }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't read that");
      return;
    }
    const { rows: parsed } = await res.json();
    if (!parsed?.length) {
      setError("Nothing recognizable in there — try a few lines with a name and partner.");
      return;
    }
    setRows([
      ...parsed.map((r: any) => ({
        client_name: r.client_name ?? "",
        partner: r.partner ?? defaultPartner,
        status: STATUSES.includes(r.status) || r.status === "lost" ? r.status : "new",
        closing_date: r.closing_date ?? "",
        client_phone: r.client_phone ?? "",
        premium: r.premium != null ? String(r.premium) : "",
      })),
      { ...BLANK, partner: defaultPartner },
    ]);
    setTab("type");
  }

  // CSV / TSV: tolerant of the export format we produce and of a plain
  // spreadsheet with a header row.
  async function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return;
    const delim = lines[0].includes("\t") ? "\t" : ",";
    const split = (l: string) =>
      l.match(/("([^"]|"")*"|[^,\t]*)(?=[,\t]|$)/g)?.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ??
      l.split(delim);
    const header = split(lines[0]).map((h) => h.toLowerCase());
    const idx = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
    const iName = idx("client", "name", "insured");
    const iPartner = idx("partner", "lender", "referred by", "source");
    const iStatus = idx("status", "stage");
    const iClose = idx("closing", "close date");
    const iPhone = idx("phone", "mobile");
    const iPremium = idx("premium");
    const hasHeader = iName >= 0;
    const body = hasHeader ? lines.slice(1) : lines;

    const parsed: Row[] = body.map((l) => {
      const c = split(l);
      const pick = (i: number) => (i >= 0 ? (c[i] ?? "").trim() : "");
      const rawStatus = pick(iStatus).toLowerCase().replace(/\s+/g, "_");
      return {
        client_name: hasHeader ? pick(iName) : (c[0] ?? "").trim(),
        partner: hasHeader ? pick(iPartner) : (c[1] ?? "").trim(),
        status: STATUSES.includes(rawStatus as any) || rawStatus === "lost" ? rawStatus : "new",
        closing_date: /^\d{4}-\d{2}-\d{2}$/.test(pick(iClose)) ? pick(iClose) : "",
        client_phone: pick(iPhone),
        premium: pick(iPremium).replace(/[^0-9.]/g, ""),
      };
    });
    setRows([...parsed.filter((r) => r.client_name), { ...BLANK, partner: defaultPartner }]);
    setTab("type");
    setError("");
  }

  async function save() {
    const payload = rows.filter((r) => r.client_name.trim());
    if (!payload.length) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/referrals/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't save");
      return;
    }
    const out = await res.json();

    // Attach each source document to the referral it became, so the partner
    // can download the EOI for their own records.
    for (const created of out.rows ?? []) {
      const file = created.ref ? pending[created.ref] : null;
      if (!file) continue;
      const row = payload.find((r) => r.ref === created.ref);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", row?.docKind ?? "eoi");
      await fetch(`/api/referrals/${created.id}/docs`, { method: "POST", body: fd }).catch(() => {});
    }

    setResult(out);
    setPending({});
    onDone();
  }

  const ready = rows.filter((r) => r.client_name.trim()).length;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          reset();
          setTab("type");
          setOpen(true);
        }}
      >
        <IconPlus size={13} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-3 overflow-y-auto">
          <div className="card p-5 max-w-3xl w-full my-6" data-noswipe>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold tracking-tight">Build your book</h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Add the referrals you&apos;re already working. Your partners&apos; portals fill
                  in immediately — their first look should show live deals, not an empty page.
                </p>
              </div>
              <button className="text-ink-muted hover:text-ink" onClick={() => setOpen(false)}>
                <IconX size={18} />
              </button>
            </div>

            {result ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-emerald-700 font-semibold inline-flex items-center gap-2">
                  <IconCheck size={16} /> {result.created} lead{result.created === 1 ? "" : "s"} added
                </p>
                {result.skipped.length > 0 && (
                  <div className="text-left max-w-md mx-auto">
                    <p className="text-xs font-semibold text-amber-700">Skipped:</p>
                    <ul className="text-xs text-ink-secondary mt-1 space-y-0.5">
                      {result.skipped.slice(0, 8).map((s, i) => (
                        <li key={i}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2 justify-center pt-2">
                  <button className="btn-ghost !py-2 text-xs" onClick={reset}>
                    Add more
                  </button>
                  <button className="btn-primary !py-2 text-xs" onClick={() => setOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-1 mt-4 border-b border-slate-200">
                  {[
                    { k: "type" as const, l: "Type them" },
                    { k: "paste" as const, l: "Paste a list" },
                    { k: "docs" as const, l: "Upload past EOIs" },
                    { k: "file" as const, l: "Import a file" },
                  ].map((t) => (
                    <button
                      key={t.k}
                      className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                        tab === t.k ? "border-brand text-brand-700" : "border-transparent text-ink-muted hover:text-ink"
                      }`}
                      onClick={() => setTab(t.k)}
                    >
                      {t.l}
                    </button>
                  ))}
                </div>

                {tab === "paste" && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-ink-secondary">
                      Paste spreadsheet rows, an email, or just type from memory — &ldquo;Jones,
                      closing 8/15, from Cowart, already quoted.&rdquo; AI turns it into rows you
                      review before anything saves.
                    </p>
                    <textarea
                      className="input !h-40 text-sm resize-y"
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                      placeholder={"Smith — Cowart Home Loans — closing 9/12 — quoted\nJones — Summit Lending — bound, $1,840\nMartinez — Cowart — new"}
                    />
                    <button className="btn-primary !py-2 text-xs" onClick={runPaste} disabled={busy || !paste.trim()}>
                      <IconSparkles size={12} /> {busy ? "Reading…" : "Turn into leads"}
                    </button>
                  </div>
                )}

                {tab === "docs" && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-ink-secondary">
                      Select the EOIs or declarations pages from deals you&apos;ve already written
                      — as many as you like. AI reads the named insured, property, carrier,
                      premium, and the mortgagee clause, and matches each one back to the partner
                      who sent it. They come in as <span className="font-medium text-ink">Bound</span>,
                      and the file is attached so your partner can download their copy.
                    </p>
                    <label className="btn-ghost cursor-pointer inline-flex">
                      {docBusy ? `Reading ${docBusy.done} of ${docBusy.total}…` : "Choose EOI files"}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={readDocs}
                        disabled={!!docBusy}
                      />
                    </label>
                    <p className="text-[11px] text-ink-muted">
                      This is how a brand-new portal opens with a year of history on it instead of
                      an empty page. Nothing is emailed or texted to your partner for backfilled
                      deals — the board just fills in.
                    </p>
                  </div>
                )}

                {tab === "file" && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-ink-secondary">
                      CSV or TSV from AgencyZoom, Agency MVP, a spreadsheet, or a ReferBound
                      export. Columns are matched by name — client, partner, status, closing date,
                      phone, premium — and anything unmatched is left blank for you to fill.
                    </p>
                    <label className="btn-ghost cursor-pointer inline-flex">
                      Choose a file
                      <input type="file" className="hidden" accept=".csv,.tsv,.txt" onChange={readFile} />
                    </label>
                  </div>
                )}

                {tab === "type" && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                          <th className="pb-1.5 font-semibold">Client</th>
                          <th className="pb-1.5 font-semibold">Partner</th>
                          <th className="pb-1.5 font-semibold">Status</th>
                          <th className="pb-1.5 font-semibold">Closing</th>
                          <th className="pb-1.5 font-semibold">Premium</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td className="pr-1.5 py-0.5">
                              <div className="relative">
                                <input
                                  className="input !py-1.5 text-sm"
                                  placeholder="Client name"
                                  value={r.client_name}
                                  onChange={(e) => setRow(i, { client_name: e.target.value })}
                                />
                                {r.ref && (
                                  <span
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-700 font-semibold"
                                    title="From an uploaded document — it'll be attached to this deal"
                                  >
                                    📎
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="pr-1.5 py-0.5">
                              <select
                                className="input !py-1.5 text-sm"
                                value={r.partner}
                                onChange={(e) => setRow(i, { partner: e.target.value })}
                              >
                                <option value="">Partner…</option>
                                {partners.map((p) => (
                                  <option key={p.id} value={p.name}>
                                    {p.name}
                                  </option>
                                ))}
                                {r.partner && !partners.some((p) => p.name === r.partner) && (
                                  <option value={r.partner}>{r.partner} (no match)</option>
                                )}
                              </select>
                            </td>
                            <td className="pr-1.5 py-0.5">
                              <select
                                className="input !py-1.5 text-sm"
                                value={r.status}
                                onChange={(e) => setRow(i, { status: e.target.value })}
                              >
                                {[...STATUSES, "lost"].map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_LABELS[s] ?? s}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="pr-1.5 py-0.5">
                              <input
                                type="date"
                                className="input !py-1.5 text-sm"
                                value={r.closing_date}
                                onChange={(e) => setRow(i, { closing_date: e.target.value })}
                              />
                            </td>
                            <td className="pr-1.5 py-0.5">
                              <input
                                className="input !py-1.5 text-sm"
                                placeholder="$"
                                value={r.premium}
                                onChange={(e) => setRow(i, { premium: e.target.value })}
                              />
                            </td>
                            <td className="py-0.5">
                              {rows.length > 1 && (
                                <button
                                  type="button"
                                  className="text-ink-muted hover:text-red-600 px-1"
                                  onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}
                                >
                                  <IconX size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

                <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                  <p className="text-[11px] text-ink-muted">
                    Backfilled leads are flagged, so they never skew the speed stats your partners
                    see.
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-ghost !py-2 text-xs" onClick={() => setOpen(false)}>
                      Cancel
                    </button>
                    <button className="btn-primary !py-2 text-xs" onClick={save} disabled={busy || ready === 0}>
                      {busy ? "Saving…" : `Add ${ready} lead${ready === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
