import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import { SAFE_STATUSES, STATUS_LABELS } from "@/lib/config";
import { fmtDate, daysUntil } from "@/lib/helpers";
import { IconArrowRight, IconMail, IconAlert } from "../../icons";

// The lender workspace: one login-free board per verified partner email,
// aggregating every ReferBound agent who works with them. The empty seats
// (their OTHER insurance agents) are the growth loop.

export const dynamic = "force-dynamic";

export default async function HubPage({ params }: { params: { token: string } }) {
  noStore();

  const { data: hub } = await db()
    .from("lender_hubs")
    .select("email")
    .eq("token", params.token)
    .maybeSingle();
  if (!hub) notFound();

  // Every partner record (across ALL agent accounts) that lists this email.
  const { data: partners } = await db()
    .from("partners")
    .select("id, name, token, account_id, emails")
    .contains("emails", [hub.email]);
  const partnerList = partners ?? [];
  const accountIds = Array.from(new Set(partnerList.map((p: any) => p.account_id).filter(Boolean)));

  // Agent identities for each account.
  const { data: profiles } = accountIds.length
    ? await db()
        .from("agent_profile")
        .select("account_id, display_name, agency_name, phone, email")
        .in("account_id", accountIds)
    : { data: [] as any[] };
  const profileByAccount = new Map((profiles ?? []).map((p: any) => [p.account_id, p]));

  // Referrals per partner record.
  const partnerIds = partnerList.map((p: any) => p.id);
  const { data: referrals } = partnerIds.length
    ? await db()
        .from("referrals")
        .select("id, client_name, closing_date, status, partner_id, created_at")
        .in("partner_id", partnerIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };
  const refs = referrals ?? [];
  const byPartner = new Map<string, any[]>();
  for (const r of refs) {
    const list = byPartner.get(r.partner_id) ?? [];
    list.push(r);
    byPartner.set(r.partner_id, list);
  }

  const isActive = (r: any) => !SAFE_STATUSES.includes(r.status) && r.status !== "lost";
  const activeTotal = refs.filter(isActive).length;
  const boundTotal = refs.filter((r) => SAFE_STATUSES.includes(r.status)).length;

  // Everything closing in the next 14 days, across ALL agents, soonest first.
  const closingSoon = refs
    .filter((r) => {
      const d = daysUntil(r.closing_date);
      return d !== null && d >= 0 && d <= 14 && r.status !== "lost";
    })
    .sort((a, b) => String(a.closing_date).localeCompare(String(b.closing_date)));

  const agentNameFor = (p: any) => {
    const prof = profileByAccount.get(p.account_id);
    return {
      agent: prof?.display_name ?? "Your agent",
      agency: prof?.agency_name ?? p.name,
    };
  };

  const inviteSubject = encodeURIComponent("Get on my referral board");
  const inviteBody = encodeURIComponent(
    `Hey,\n\nI track the insurance side of my closings on a live board — every agent I work with, every client, real-time status, documents at bind. One of my agents set it up and it's been great.\n\nCan you get set up on it too, so your deals show on my board? It's free for your first partner (me):\nhttps://referbound.com/?via=lender\n\nTakes about ten minutes.`
  );

  return (
    <main className="pb-2">
      {/* Hero band */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 90% at 85% 0%, rgba(96,138,250,0.45), transparent 65%), radial-gradient(45% 70% at 5% 100%, rgba(16,185,129,0.16), transparent 60%)",
          }}
        />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-16">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-100">
            <span className="live-dot" aria-hidden />
            Your referral board
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">
            Every agent. Every referral. One page.
          </h1>
          <p className="text-sm text-brand-100 mt-2">
            Live for <span className="font-semibold text-white">{hub.email}</span> — bookmark this
            page; it updates in real time.
          </p>
        </div>
      </div>

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 -mt-10 space-y-5">
        {/* Aggregate stats */}
        <div className="card grid grid-cols-3 divide-x divide-slate-100 shadow-lift">
          {[
            { n: partnerList.length, label: partnerList.length === 1 ? "Agent" : "Agents" },
            { n: activeTotal, label: "In progress" },
            { n: boundTotal, label: "Bound" },
          ].map((s) => (
            <div key={s.label} className="px-6 py-4 text-center sm:text-left">
              <p className="text-[22px] leading-7 font-semibold tracking-tight">{s.n}</p>
              <p className="text-xs text-ink-secondary">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Closings radar */}
        {closingSoon.length > 0 && (
          <section className="card p-5">
            <h2 className="section-label mb-3">Closing in the next 14 days</h2>
            <ul className="space-y-2.5">
              {closingSoon.map((r: any) => {
                const done = SAFE_STATUSES.includes(r.status);
                const p = partnerList.find((x: any) => x.id === r.partner_id);
                const who = p ? agentNameFor(p) : null;
                return (
                  <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.client_name}</p>
                      <p className="text-xs text-ink-muted">
                        closes {fmtDate(r.closing_date)}
                        {who && <> · with {who.agent}</>}
                      </p>
                    </div>
                    <span
                      className={`badge shrink-0 ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {done ? "Insurance ready ✓" : (STATUS_LABELS[r.status] ?? r.status)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Per-agent cards */}
        <div className="space-y-3">
          {partnerList.map((p: any) => {
            const who = agentNameFor(p);
            const list = byPartner.get(p.id) ?? [];
            const act = list.filter(isActive).length;
            const bnd = list.filter((r) => SAFE_STATUSES.includes(r.status)).length;
            const flagged = list.some(
              (r) => isActive(r) && daysUntil(r.closing_date) !== null && (daysUntil(r.closing_date) as number) <= 7
            );
            return (
              <Link key={p.id} href={`/p/${p.token}`} className="card p-5 flex items-center justify-between gap-4 hover:shadow-lift transition-shadow group block">
                <div className="min-w-0">
                  <p className="font-semibold group-hover:text-brand transition-colors">
                    {who.agent} <span className="font-normal text-ink-muted">· {who.agency}</span>
                  </p>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    {act} in progress · {bnd} bound
                    {flagged && (
                      <span className="text-red-600 font-medium inline-flex items-center gap-1 ml-2">
                        <IconAlert size={11} /> closing soon
                      </span>
                    )}
                  </p>
                </div>
                <span className="link shrink-0">
                  Open portal <IconArrowRight size={12} />
                </span>
              </Link>
            );
          })}

          {/* The empty seat — the growth loop */}
          <div className="card p-5 border-dashed">
            <p className="font-semibold text-sm">Work with another insurance agent?</p>
            <p className="text-xs text-ink-secondary mt-1">
              Their deals aren&apos;t on your board yet. Ask them to set up ReferBound — free for
              their first partner (you) — and every referral you send them shows up here too.
            </p>
            <a
              href={`mailto:?subject=${inviteSubject}&body=${inviteBody}`}
              className="btn-primary !py-1.5 text-xs inline-flex mt-3"
            >
              <IconMail size={13} /> Invite an agent
            </a>
          </div>
        </div>

        <footer className="text-center text-xs text-ink-muted pt-4 pb-8">
          <a href="/" className="hover:underline">
            Powered by <span className="font-semibold text-ink-secondary">Refer<span className="text-brand">Bound</span></span>
          </a>
          {" · "}Private to {hub.email} — don&apos;t forward this link
        </footer>
      </div>
    </main>
  );
}
