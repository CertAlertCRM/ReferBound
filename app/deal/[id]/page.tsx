"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { STATUSES, STATUS_LABELS, DOC_KINDS } from "@/lib/config";
import { StatusBadge } from "../../components";

type Doc = { id: string; kind: string; file_name: string; created_at: string };
type Event = { status: string; created_at: string };
type Referral = {
  id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  closing_date: string | null;
  status: string;
  lost_reason: string | null;
  notes: string | null;
  source: string;
  log_seconds: number | null;
  created_at: string;
  partners: { name: string } | null;
  documents: Doc[];
};

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Referral | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docKind, setDocKind] = useState("eoi");
  const [lostReason, setLostReason] = useState("");
  const [showLost, setShowLost] = useState(false);

  async function load() {
    const res = await fetch(`/api/referrals`);
    if (!res.ok) return;
    const all: Referral[] = (await res.json()).referrals ?? [];
    const found = all.find((x) => x.id === id) ?? null;
    setR(found);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function setStatus(status: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const res = await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    setBusy(false);
    if (res.ok) {
      setShowLost(false);
      load();
    } else alert((await res.json()).error ?? "Failed");
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", docKind);
    const res = await fetch(`/api/referrals/${id}/docs`, { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (res.ok) load();
    else alert((await res.json()).error ?? "Upload failed");
  }

  async function del() {
    if (!confirm("Delete this referral? This cannot be undone.")) return;
    await fetch(`/api/referrals/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!r) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  const hasEoi = r.documents.some((d) => d.kind === "eoi");

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <Link href="/" className="text-sm text-brand">← Back to referrals</Link>

      <header className="card p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{r.client_name}</h1>
            <p className="text-sm text-slate-500">
              Referred by {r.partners?.name ?? "—"}
              {r.source === "partner" && " (via portal)"}
            </p>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <div className="text-sm text-slate-600 space-y-0.5">
          {r.client_phone && <p>📞 {r.client_phone}</p>}
          {r.closing_date && <p>🏠 Closing {r.closing_date}</p>}
          {r.notes && <p className="text-slate-500">“{r.notes}”</p>}
          {r.log_seconds !== null && (
            <p className="text-xs text-slate-400">Logged in {r.log_seconds}s</p>
          )}
        </div>
      </header>

      {/* Status controls */}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-500">Update status</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={busy || r.status === s}
              className={r.status === s ? "btn-primary text-xs" : "btn-ghost text-xs"}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          <button
            onClick={() => setShowLost(!showLost)}
            disabled={busy}
            className={`text-xs ${r.status === "lost" ? "btn-primary" : "btn-ghost"}`}
          >
            {STATUS_LABELS.lost}
          </button>
        </div>
        {showLost && (
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Reason (optional — e.g., carrier declined, client went elsewhere)"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            />
            <button className="btn-primary shrink-0" onClick={() => setStatus("lost", { lost_reason: lostReason })}>
              Confirm
            </button>
          </div>
        )}
        {r.status === "bound" && !hasEoi && (
          <p className="text-xs text-amber-600">
            Bound — upload the EOI (and RCE) below, then mark “EOI &amp; docs delivered” to notify {r.partners?.name}.
          </p>
        )}
      </section>

      {/* Documents */}
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-500">Documents</h2>
        {r.documents.length > 0 && (
          <ul className="space-y-1">
            {r.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{DOC_KINDS[d.kind] ?? d.kind}</span>
                  <span className="text-slate-400"> — {d.file_name}</span>
                </span>
                <a className="text-brand text-xs" href={`/api/docs/${d.id}/download`} target="_blank">
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <select className="input max-w-[260px]" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
            {Object.entries(DOC_KINDS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="btn-ghost cursor-pointer">
            {uploading ? "Uploading…" : "Upload file"}
            <input type="file" className="hidden" onChange={upload} disabled={uploading} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Partners can download these from their portal once the deal is marked bound / delivered.
        </p>
      </section>

      <button onClick={del} className="text-xs text-red-500">Delete referral</button>
    </main>
  );
}
