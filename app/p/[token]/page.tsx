import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import { currentAccountId } from "@/lib/auth";
import { APP_CONFIG, STATUS_LABELS, STATUSES, DOC_KINDS_PARTNER, SAFE_STATUSES } from "@/lib/config";
import { isAtRisk, fmtDate, daysUntil, timeAgo } from "@/lib/helpers";
import { themeStyle } from "@/lib/themes";
import { ShareCard } from "./share-card";
import { HubCard } from "./hub-card";
import { FeedbackWidget } from "../../feedback-widget";
import { PartnerSubmitForm } from "./submit-form";
import { AutoRefresh } from "./auto-refresh";
import { ReferralMessages } from "./referral-messages";
import { IntroEmail } from "./intro-email";
import { DOCS_BUCKET } from "@/lib/db";
import {
  IconArrowLeft,
  IconArrowRight,
  IconAlert,
  IconPaperclip,
  IconDownload,
  IconPhone,
  IconMail,
} from "../../icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }) {
  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  const { data: partner } = await db()
    .from("partners")
    .select("name")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  return {
    title: partner ? `${partner.name} — Live Referral Portal` : "Referral Portal",
    // Each portal is its own installable app: the per-portal manifest names it
    // after the partnership and opens straight to this page — never the agent
    // login. iOS Add-to-Home-Screen saves the current URL, so it works there too.
    manifest: `/api/p/${slug}/manifest`,
    appleWebApp: { capable: true, title: partner?.name ?? "Referrals", statusBarStyle: "default" as const },
  };
}

const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  new: { pill: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
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
  // Accept both the original long token and the compact short code — old
  // links a partner already bookmarked keep working forever.
  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token, logo_path, partner_type, account_id")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
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
    .select("id, client_name, closing_date, status, created_at, updated_at, backfilled, partner_contacts(name), documents(id, kind, file_name, uploaded_by, purged_at)")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false });

  if (refError) {
    console.error("Partner portal referral query failed:", refError);
  }

  const refs = referrals ?? [];
  const active = refs.filter((r) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost");
  const bound = refs.filter((r) => SAFE_STATUSES.includes(r.status));

  // Known team contacts, for the submit form's "who's sending this?" picker.
  const { data: teamContacts } = await db()
    .from("partner_contacts")
    .select("id, name, role")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: true });

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

  // Latest agent touch per referral (calls/texts/emails to the client) —
  // partner-visible proof the file is actively being worked.
  const { data: touches } = refIds.length
    ? await db()
        .from("activity_log")
        .select("referral_id, detail, created_at")
        .in("referral_id", refIds)
        .eq("event_type", "touch")
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] as any[] };
  const latestTouchByRef = new Map<string, { detail: string; created_at: string }>();
  for (const t of touches ?? []) {
    if (!latestTouchByRef.has(t.referral_id)) {
      latestTouchByRef.set(t.referral_id, { detail: t.detail, created_at: t.created_at });
    }
  }

  // Speed receipts: how fast this agent turns THIS partner's referrals.
  // Bragging material for the partner ("my insurance guy quotes in hours").
  const { data: speedEvents } = refIds.length
    ? await db()
        .from("status_events")
        .select("referral_id, status, created_at")
        .in("referral_id", refIds)
        .in("status", ["new", "quoted", "bound"])
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
  const firstEvent = new Map<string, number>();
  for (const e of speedEvents ?? []) {
    const k = `${e.referral_id}:${e.status}`;
    if (!firstEvent.has(k)) firstEvent.set(k, new Date(e.created_at).getTime());
  }
  const quoteHours: number[] = [];
  const bindHours: number[] = [];
  let onTime = 0;
  let onTimeTotal = 0;
  for (const r of refs) {
    // Backfilled leads carry no honest clock — a deal entered today but quoted
    // three weeks ago would report a fake three-week turnaround. Skip them.
    if ((r as any).backfilled) continue;
    const t0 = firstEvent.get(`${r.id}:new`) ?? new Date(r.created_at).getTime();
    const tq = firstEvent.get(`${r.id}:quoted`);
    const tb = firstEvent.get(`${r.id}:bound`);
    if (tq && tq > t0) quoteHours.push((tq - t0) / 3600000);
    if (tb && tb > t0) bindHours.push((tb - t0) / 3600000);
    if (tb && r.closing_date) {
      onTimeTotal++;
      if (new Date(tb) <= new Date(r.closing_date + "T23:59:59")) onTime++;
    }
  }
  const fmtHours = (arr: number[]) => {
    if (!arr.length) return null;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return avg <= 48 ? `${Math.max(1, Math.round(avg))}h` : `${Math.round((avg / 24) * 10) / 10}d`;
  };
  const avgQuote = fmtHours(quoteHours);
  const avgBind = fmtHours(bindHours);
  const onTimeRate = onTimeTotal > 0 ? Math.round((onTime / onTimeTotal) * 100) : null;

  // Prefer the agent's saved profile for partner-facing names; fall back to env config.
  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name, phone, email, headshot_path, brand_color, show_scorecard")
    .eq("account_id", (partner as any).account_id)
    .maybeSingle();
  // Agent's choice: new/busy agents can keep speed stats off their portals
  // until the numbers tell a story they want told.
  const showSpeed =
    (prof as any)?.show_scorecard !== false && (avgQuote !== null || avgBind !== null);
  // Per-account only — never fall back to env branding, which belongs to the
  // founding agency and must not leak onto other accounts' portals.
  const agentName = prof?.display_name || "your agent";
  const agencyName = prof?.agency_name || prof?.display_name || "Your Insurance Agent";

  let headshotUrl: string | null = null;
  if (prof?.headshot_path) {
    const { data: signed } = await db()
      .storage.from(DOCS_BUCKET)
      .createSignedUrl(prof.headshot_path, 60 * 60);
    headshotUrl = signed?.signedUrl ?? null;
  }

  // Only the OWNING agent (or their teammates) sees this — partners and
  // unrelated accounts never do.
  const viewerId = currentAccountId();
  let agentView = viewerId === (partner as any).account_id;
  if (!agentView && viewerId) {
    const { data: viewer } = await db()
      .from("accounts")
      .select("team_owner_id")
      .eq("id", viewerId)
      .maybeSingle();
    agentView = viewer?.team_owner_id === (partner as any).account_id;
  }

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
    <main className="pb-2" style={themeStyle((prof as any)?.brand_color)}>
      <AutoRefresh />

      {/* Full-bleed co-branded hero — this band owns the top of the viewport */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 90% at 85% 0%, rgb(var(--brand-400) / 0.45), transparent 65%), radial-gradient(45% 70% at 5% 100%, rgba(16,185,129,0.16), transparent 60%)",
          }}
        />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-16 sm:pb-20">
          {agentView && (
            <div className="mb-6 rounded-xl bg-white/10 border border-white/15 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-brand-100">
                You&apos;re viewing this portal as the agent — this bar is invisible to your partner.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs font-semibold text-white hover:text-brand-100 transition-colors shrink-0"
              >
                <IconArrowLeft size={13} /> Back to dashboard
              </Link>
            </div>
          )}
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
                  // Fixed chip: same generous size for every logo. Without a set
                  // width, square logos collapse to a small box while wide
                  // wordmarks get a banner — object-contain scales any shape up
                  // to fill this frame instead.
                  className="mt-5 h-24 sm:h-28 w-[260px] sm:w-[320px] object-contain bg-white rounded-xl px-5 py-3 shadow-lg"
                />
              )}
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-3">
                {partner.name} <span className="font-normal text-brand-200">×</span> {agencyName}
              </h1>
              <p className="text-sm text-brand-100 mt-2 max-w-md">
                Every client you&apos;ve referred to {agentName}, updated in real time. Insurance documents post here as soon as they're ready after binding.
              </p>
              {(prof?.phone || prof?.email) && (
                <p className="text-xs text-brand-100 mt-3 flex items-center flex-wrap gap-x-3 gap-y-1">
                  <span>Reach {agentName?.split(" ")[0]} directly:</span>
                  {prof?.phone && (
                    <span className="font-semibold inline-flex items-center gap-1">
                      <IconPhone size={12} /> {prof.phone}
                    </span>
                  )}
                  {prof?.email && (
                    <span className="font-semibold inline-flex items-center gap-1">
                      <IconMail size={12} /> {prof.email}
                    </span>
                  )}
                </p>
              )}
            </div>
            {headshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headshotUrl}
                alt={agentName ?? "Agent"}
                className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover border-4 border-white/90 shadow-xl shrink-0"
              />
            )}
          </div>
        </div>
      </div>

      {/* Content column — stats card floats up over the hero seam */}
      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 space-y-5">
        <div className="card grid grid-cols-3 divide-x divide-slate-100 shadow-lift">
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

        {showSpeed && (
          <div className="card px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              {agencyName} on your referrals
            </p>
            <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-xs text-ink-secondary">
              {avgQuote && (
                <span>
                  <span className="font-bold text-ink text-sm">{avgQuote}</span> avg to quote
                </span>
              )}
              {avgBind && (
                <span>
                  <span className="font-bold text-ink text-sm">{avgBind}</span> avg to bound
                </span>
              )}
              {onTimeRate !== null && (
                <span>
                  <span className={`font-bold text-sm ${onTimeRate >= 90 ? "text-emerald-600" : "text-ink"}`}>{onTimeRate}%</span> ready by closing
                </span>
              )}
            </div>
          </div>
        )}

      <PartnerSubmitForm
        token={partner.token}
        partnerType={partner.partner_type ?? "lender"}
        contacts={(teamContacts ?? []) as any}
      />

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
                      {(r as any).partner_contacts?.name && <> by {(r as any).partner_contacts.name}</>}
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
                    <p className="mt-1.5 text-[11px] text-ink-muted">
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
                  <p className="mt-3 text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <IconAlert size={13} className="shrink-0" /> Closing soon and insurance is not yet
                    bound — {agentName} is on it.
                  </p>
                )}

                {latestTouchByRef.has(r.id) && !SAFE_STATUSES.includes(r.status) && r.status !== "lost" && (
                  <p className="mt-3 text-[11px] text-ink-secondary bg-slate-50 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                    <span className="live-dot" aria-hidden />
                    <span>
                      <span className="font-semibold">{latestTouchByRef.get(r.id)!.detail}</span>
                      {" · "}
                      {timeAgo(latestTouchByRef.get(r.id)!.created_at)}
                    </span>
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
                        <IconDownload size={12} strokeWidth={2.5} />
                        {DOC_KINDS_PARTNER[d.kind] ?? d.file_name}
                      </a>
                    ))}
                  </div>
                )}

                {partnerDocs.length > 0 && (
                  <p className="mt-2.5 text-[11px] text-ink-muted inline-flex items-center gap-1">
                    <IconPaperclip size={11} /> You sent:{" "}
                    {partnerDocs.map((d: any) => DOC_KINDS_PARTNER[d.kind] ?? d.file_name).join(", ")}
                  </p>
                )}

                {r.status !== "lost" && (
                  <div className="mt-3">
                    <IntroEmail token={partner.token} referralId={r.id} clientName={r.client_name} />
                  </div>
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
                      <span className="link">Show all</span>
                    </summary>
                    <div className="space-y-3 mt-3">{closedRefs.map(renderCard)}</div>
                  </details>
                )}
              </>
            );
          })()}
        </div>
      )}

      <HubCard />

      <ShareCard agentName={agentName} agencyName={agencyName} />

      <FeedbackWidget source="partner" context={`portal: ${partner.name}`} />

      <footer className="text-center text-xs text-ink-muted pt-4 pb-8">
        <span className="block mb-2">
          📱 Keep this portal one tap away — on iPhone: Safari → Share → Add to Home Screen; on
          Android or desktop Chrome/Edge: the Install option in the address bar. It opens straight
          here, like an app.
        </span>
        <a href="/" className="hover:underline">
          Powered by <span className="font-semibold text-ink-secondary">Refer<span className="text-brand">Bound</span></span>
        </a>
        {" · "}a{" "}
        <a href="https://stonebind.com" className="hover:underline">
          Stonebind™
        </a>{" "}
        tool{" · "}Statuses update in real time
        <span className="mt-1 inline-flex items-center gap-1">
          Are you an insurance agent?{" "}
          <a href="/" className="link !text-xs">
            Get this for your partners <IconArrowRight size={12} />
          </a>
        </span>
        <span className="block mt-1">
          <a href="/terms" className="link-muted !text-[11px]">Terms</a>
          {" · "}
          <a href="/privacy" className="link-muted !text-[11px]">Privacy</a>
        </span>
      </footer>
      </div>
    </main>
  );
}
