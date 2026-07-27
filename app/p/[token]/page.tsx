import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { APP_CONFIG, STATUS_LABELS, DOC_KINDS, SAFE_STATUSES } from "@/lib/config";
import { isAtRisk, fmtDate, daysUntil } from "@/lib/helpers";
import { PartnerSubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  quoting: "bg-amber-100 text-amber-800",
  quoted: "bg-blue-100 text-blue-800",
  application: "bg-indigo-100 text-indigo-800",
  bound: "bg-green-100 text-green-800",
  docs_delivered: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-200 text-slate-500",
};

export default async function PartnerPortal({ params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token")
    .eq("token", params.token)
    .single();
  if (!partner) notFound();

  const { data: referrals } = await db()
    .from("referrals")
    .select("id, client_name, closing_date, status, created_at, documents(id, kind, file_name)")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false });

  const refs = referrals ?? [];
  const active = refs.filter((r) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost");
  const done = refs.filter((r) => SAFE_STATUSES.includes(r.status));
  const boundCount = done.length;

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="card p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Referral portal</p>
        <h1 className="text-xl font-bold mt-1">
          {partner.name} <span className="text-slate-400 font-normal">×</span> {APP_CONFIG.agencyName}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Live status on every client you&apos;ve referred to {APP_CONFIG.agentName}. Documents appear here the moment policies are bound.
        </p>
        <div className="flex gap-4 mt-3 text-sm">
          <span><strong>{refs.length}</strong> referred</span>
          <span><strong>{active.length}</strong> in progress</span>
          <span><strong>{boundCount}</strong> bound</span>
        </div>
      </header>

      <PartnerSubmitForm token={partner.token} />

      {refs.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">No referrals yet.</div>
      ) : (
        <div className="space-y-3">
          {refs.map((r) => {
            const risk = isAtRisk(r.closing_date, r.status);
            const days = daysUntil(r.closing_date);
            const docs = (r.documents ?? []).filter(() => SAFE_STATUSES.includes(r.status));
            return (
              <div key={r.id} className={`card p-4 ${risk ? "border-red-300" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.client_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Referred {fmtDate(r.created_at)}
                      {r.closing_date && <> · Closing {fmtDate(r.closing_date)}{days !== null && days >= 0 ? ` (${days}d)` : ""}</>}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-700"}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>

                {risk && (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    ⚠ Closing soon and insurance is not yet bound — {APP_CONFIG.agentName} is on it.
                  </p>
                )}

                {docs.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2 space-y-1">
                    {docs.map((d) => (
                      <a
                        key={d.id}
                        href={`/api/docs/${d.id}/download?t=${partner.token}`}
                        className="flex items-center justify-between text-sm text-brand hover:underline"
                      >
                        <span>⬇ {DOC_KINDS[d.kind] ?? d.file_name}</span>
                        <span className="text-xs text-slate-400">{d.file_name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <footer className="text-center text-xs text-slate-400 pt-4">
        Powered by {APP_CONFIG.productName} · Statuses update in real time
      </footer>
    </main>
  );
}
