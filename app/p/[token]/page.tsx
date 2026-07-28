import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import { isAgentAuthed } from "@/lib/auth";
import { APP_CONFIG, STATUS_LABELS, STATUSES, DOC_KINDS, SAFE_STATUSES } from "@/lib/config";
import { isAtRisk, fmtDate, daysUntil } from "@/lib/helpers";
import { PartnerSubmitForm } from "./submit-form";
import { AutoRefresh } from "./auto-refresh";
import { ReferralMessages } from "./referral-messages";
import { DOCS_BUCKET } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("name")
    .eq("token", params.token)
    .maybeSingle();
  return {
    title: partner ? `${partner.name} — Live Referral Portal` : "Referral Portal",
  };
}

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
  noStore(); // opt this render out of every Next.js cache layer — always live data
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token, logo_path")
    .eq("token", params.token)
    .single();
  if (!partner) notFound();

  let partnerLogoUrl: string | null = null;
  if (partner.logo_path) {
    const { data: signed } = await db()
      .storage.from(DOCS_BUCKET)
      .createSignedUrl(partner.logo_path, 60 * 60);
    partnerLogoUrl = signed?.signedUrl ?? null;
  }

  const { data: referrals, error: refError } = await db()
    .from("referrals")
    .select("id, client_name, closing_date, status, created_at, updated_at, documents(id, kind, file_name, uploaded_by)")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false });

  if (refError) {
    console.error("Partner portal referral query failed:", refError);
  }

  const refs = referrals ?? [];
  const active = refs.filter((r) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost");
  const bound = refs.filter((r) => SAFE_STATUSES.includes(r.status));

  // Message threads for this partner's referrals, grouped per referral.
  const refIds = refs.map((r) => r.id);
  const { data: allMessages } = refIds.length
    ? await db()
        .from("messages")
        .select("id, referral_id, sender, body, created_at")
        .in("referral_id", refIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
  const messagesByRef = new Map<string, any[]>();
  for (const m of allMessages ?? []) {
    const list = messagesByRef.get(m.referral_id) ?? [];
    list.push(m);
    messagesByRef.set(m.referral_id, list);
  }

  // Prefer the agent's saved profile for partner-facing names; fall back to env config.
  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name, phone, email, headshot_path")
    .eq("id", "default")
    .maybeSingle();
  const agencyName = prof?.agency_name || APP_CONFIG.agencyName;
  const agentName = prof?.display_name || APP_CONFIG.agentName;

  let headshotUrl: string | null = null;
  if (prof?.headshot_path) {
    const { data: signed } = await db()
      .storage.from(DOCS_BUCKET)
      .createSignedUrl(prof.headshot_path, 60 * 60);
    headshotUrl = signed?.signedUrl ?? null;
  }

  // Only the logged-in agent sees this — partners never do.
  const agentView = isAgentAuthed();

  // Active work floats to the top (at-risk first); finished business collapses.
  const isClosedRef = (r: any) => SAFE_STATUSES.includes(r.status) || r.status === "lost";
  const openRefs = refs
    .filter((r) => !isClosedRef(r))
    .sort(
      (a, b) =>
        (isAtRisk(b.closing_date, b.status) ? 1 : 0) - (isAtRisk(a.closing_date, a.status) ? 1 : 0)
    );
  const closedRefs = refs.filter(isClosedRef);

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      {agentView && (
        <div className="card px-4 py-2.5 flex items-center justify-between bg-brand-light/60 border-brand-200">
          <p className="text-xs font-medium text-brand-800">
            You&apos;re viewing this portal as the agent — this bar is invisible to your partner.
          </p>
          <Link href="/" className="text-xs font-semibold text-brand hover:text-brand-dark shrink-0">
            ← Back to dashboard
          </Link>
        </div>
      )}
      <AutoRefresh />
      {/* Hero header */}
      <header className="card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 px-6 py-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-100">
                <span className="live-dot" aria-hidden />
                Live referral tracking
              </div>
              {partnerLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={partnerLogoUrl}
                  alt={partner.name}
                  className="mt-4 h-16 sm:h-20 max-w-[300px] object-contain object-left bg-white rounded-xl px-4 py-2.5 shadow-lg"
                />
              )}
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-2">
                {partner.name} <span className="font-normal text-brand-200">×</span> {agencyName}
              </h1>
              <p className="text-sm text-brand-100 mt-1.5">
                Every client you&apos;ve referred to {agentName}, updated in real time. Documents land here the moment policies are bound.
              </p>
              {(prof?.phone || prof?.email) && (
                <p className="text-xs text-brand-100 mt-2.5">
                  Reach {agentName?.split(" ")[0]} directly:
                  {prof?.phone && <span className="font-semibold"> {prof.phone}</span>}
                  {prof?.phone && prof?.email && " · "}
                  {prof?.email && <span className="font-semibold">{prof.email}</span>}
                </p>
              )}
            </div>
            {headshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headshotUrl}
                alt={agentName ?? "Agent"}
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-[3px] border-white shadow-xl shrink-0"
              />
            )}
          </div>
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
        <div className="card p-10 text-center">
          <p className="font-semibold">Your referrals will appear here</p>
          <p className="text-sm text-ink-secondary mt-1.5 max-w-sm mx-auto">
            The moment {agentName} logs a client you&apos;ve sent — or you submit one above — it shows
            up here with live status the whole way to bound.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            const renderCard = (r: any) => {
            const risk = isAtRisk(r.closing_date, r.status);
            const days = daysUntil(r.closing_date);
            const style = STATUS_STYLES[r.status] ?? STATUS_STYLES.new;
            // Agent-delivered docs unlock once the deal is bound; the partner's
            // own uploads are always visible to them.
            const docs = (r.documents ?? []).filter(
              (d: any) => d.uploaded_by !== "partner" && SAFE_STATUSES.includes(r.status)
            );
            const partnerDocs = (r.documents ?? []).filter((d: any) => d.uploaded_by === "partner");
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
                      {r.updated_at && <> · Updated {fmtDate(r.updated_at)}</>}
                    </p>
                  </div>
                  <span className={`badge ${style.pill}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>

                <div className="mt-3.5">
                  <Progress status={r.status} />
                  {r.status !== "lost" && (
                    <p className="mt-1.5 text-[10px] text-ink-muted">
                      {SAFE_STATUSES.includes(r.status) ? (
                        <span className="text-emerald-600 font-semibold">
                          {STATUS_LABELS[r.status]} — all set
                        </span>
                      ) : (
                        <>
                          Now: <span className="font-semibold text-ink-secondary">{STATUS_LABELS[r.status]}</span>
                          {STATUSES.indexOf(r.status as (typeof STATUSES)[number]) >= 0 &&
                            STATUSES.indexOf(r.status as (typeof STATUSES)[number]) < STATUSES.length - 1 && (
                              <>
                                {" "}· Next:{" "}
                                {STATUS_LABELS[STATUSES[STATUSES.indexOf(r.status as (typeof STATUSES)[number]) + 1]]}
                              </>
                            )}
                        </>
                      )}
                    </p>
                  )}
                </div>

                {risk && (
                  <p className="mt-3 text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2">
                    ⚠ Closing soon and insurance is not yet bound — {agentName} is on it.
                  </p>
                )}

                {docs.length === 0 ? null : (
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {docs.map((d: any) => (
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

                {partnerDocs.length > 0 && (
                  <p className="mt-2.5 text-[10px] text-ink-muted">
                    📎 You sent: {partnerDocs.map((d: any) => DOC_KINDS[d.kind] ?? d.file_name).join(", ")}
                  </p>
                )}

                <ReferralMessages
                  token={partner.token}
                  referralId={r.id}
                  messages={messagesByRef.get(r.id) ?? []}
                  agentName={agentName}
                  partnerName={partner.name}
                />
              </div>
            );
            };
            return (
              <>
                {openRefs.map(renderCard)}
                {closedRefs.length > 0 && (
                  <details className="pt-1">
                    <summary className="cursor-pointer list-none card px-4 py-3 flex items-center justify-between hover:shadow-lift transition-shadow">
                      <span className="section-label">Completed &amp; past · {closedRefs.length}</span>
                      <span className="text-xs font-semibold text-brand">Show ▾</span>
                    </summary>
                    <div className="space-y-3 mt-3">{closedRefs.map(renderCard)}</div>
                  </details>
                )}
              </>
            );
          })()}
        </div>
      )}

      <footer className="text-center text-xs text-ink-muted pt-4 pb-8">
        <a href="/" className="hover:underline">
          Powered by <span className="font-semibold text-ink-secondary">Refer<span className="text-brand">Live</span></span>
        </a>
        {" · "}Statuses update in real time
        <span className="block mt-1">
          Are you an insurance agent?{" "}
          <a href="/" className="text-brand font-medium hover:underline">
            Get this for your partners →
          </a>
        </span>
      </footer>
    </main>
  );
}
