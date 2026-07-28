import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { APP_CONFIG, STATUS_LABELS, STATUSES, DOC_KINDS, SAFE_STATUSES } from "@/lib/config";
import { isAtRisk, fmtDate, daysUntil } from "@/lib/helpers";
import { PartnerSubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  new: { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  quoting: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  quoted: { pill: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  application: { pill: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  bound: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  docs_delivered: { pill: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  lost: { pill: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
};

function Progress({ status }: { status: string }) {
  if (status === "lost") {
    return (
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <div key={s} className="seg opacity-60" />
        ))}
      </div>
    );
  }
  const idx = STATUSES.indexOf(status as (typeof STATUSES)[number]);
  const done = SAFE_STATUSES.includes(status);
  return (
    <div className="flex gap-1">
      {STATUSES.map((s, i) => (
        <div key={s} className={`seg ${i <= idx ? (done ? "seg-done" : "seg-filled") : ""}`} />
      ))}
    </div>
  );
}

export default async function PartnerPortal({ params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token")
    .eq("token", params.token)
    .single();
  if (!partner) notFound();

  const { data: referrals, error: refError } = await db()
    .from("referrals")
    .select("id, client_name, closing_date, status, created_at, documents(id, kind, file_name)")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false });

  if (refError) {
    console.error("Partner portal referral query failed:", refError);
  }

  const refs = referrals ?? [];
  const active = refs.filter((r) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost");
  const bound = refs.filter((r) => SAFE_STATUSES.includes(r.status));

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Hero header */}
      <header className="card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 px-6 py-6 text-white">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-100">
            <span className="live-dot" aria-hidden />
            Live referral tracking
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-2">
            {partner.name} <span className="font-normal text-brand-200">×</span> {APP_CONFIG.agencyName}
          </h1>
          <p className="text-sm text-brand-100 mt-1.5">
            Every client you&apos;ve referred to {APP_CONFIG.agentName}, updated in real time. Documents land here the moment policies are bound.
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          {[
            { n: refs.length, label: "Referred" },
            { n: active.length, label: "In progress" },
            { n: bound.length, label: "Bound" },
          ].map((s) => (
            <div key={s.label} className="px-6 py-4 text-center sm:text-left">
              <p className="text-[22px] leading-7 font-semibold tracking-tight">{s.n}</p>
              <p className="text-xs text-ink-secondary">{s.label}</p>
            </div>
          ))}
        </div>
      </header>

      <PartnerSubmitForm token={partner.token} />

      {refError ? (
        <div className="card p-6 border-red-200 text-sm">
          <p className="font-semibold text-red-700">Couldn&apos;t load referrals</p>
          <p className="text-ink-secondary mt-1 break-all">{refError.message}</p>
        </div>
      ) : refs.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted text-sm">No referrals yet.</div>
      ) : (
        <div className="space-y-3">
          {refs.map((r) => {
            const risk = isAtRisk(r.closing_date, r.status);
            const days = daysUntil(r.closing_date);
            const style = STATUS_STYLES[r.status] ?? STATUS_STYLES.new;
            const docs = (r.documents ?? []).filter(() => SAFE_STATUSES.includes(r.status));
            return (
              <div key={r.id} className={`card p-5 ${risk ? "border-red-200" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.client_name}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Referred {fmtDate(r.created_at)}
                      {r.closing_date && (
                        <> · Closing {fmtDate(r.closing_date)}{days !== null && days >= 0 ? ` (${days}d)` : ""}</>
                      )}
                    </p>
                  </div>
                  <span className={`badge ${style.pill}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>

                <div className="mt-3.5">
                  <Progress status={r.status} />
                </div>

                {risk && (
                  <p className="mt-3 text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2">
                    ⚠ Closing soon and insurance is not yet bound — {APP_CONFIG.agentName} is on it.
                  </p>
                )}

                {docs.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {docs.map((d) => (
                      <a
                        key={d.id}
                        href={`/api/docs/${d.id}/download?t=${partner.token}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-light text-brand-700 hover:bg-brand-100 px-3 py-1.5 text-xs font-semibold transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {DOC_KINDS[d.kind] ?? d.file_name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <footer className="text-center text-xs text-ink-muted pt-4 pb-8">
        Powered by <span className="font-semibold text-ink-secondary">Refer<span className="text-brand">Live</span></span> · Statuses update in real time
      </footer>
    </main>
  );
}
