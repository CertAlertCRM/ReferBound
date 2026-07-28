import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const s = db();
  const [{ data: referrals }, { data: events }, { data: emails }] = await Promise.all([
    s.from("referrals").select("id, status, source, log_seconds, created_at, premium, partner_id, partners(name)"),
    s.from("status_events").select("referral_id, status, created_at"),
    s.from("email_log").select("kind, sent, created_at"),
  ]);

  const refs = referrals ?? [];
  const evs = events ?? [];
  const ems = emails ?? [];

  const byStatus: Record<string, number> = {};
  for (const r of refs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  const logTimes = refs.map((r) => r.log_seconds).filter((x): x is number => typeof x === "number");
  const avgLog = logTimes.length ? logTimes.reduce((a, b) => a + b, 0) / logTimes.length : null;

  // time from first event (new) to bound, per referral
  const firstNew: Record<string, number> = {};
  const firstBound: Record<string, number> = {};
  for (const e of evs) {
    const t = new Date(e.created_at).getTime();
    if (e.status === "new" && !(e.referral_id in firstNew)) firstNew[e.referral_id] = t;
    if (e.status === "bound" && !(e.referral_id in firstBound)) firstBound[e.referral_id] = t;
  }
  const boundDurations = Object.keys(firstBound)
    .filter((id) => id in firstNew)
    .map((id) => (firstBound[id] - firstNew[id]) / 3600000); // hours
  const avgHoursToBound = boundDurations.length
    ? boundDurations.reduce((a, b) => a + b, 0) / boundDurations.length
    : null;

  const bound = (byStatus["bound"] ?? 0) + (byStatus["docs_delivered"] ?? 0);
  const lost = byStatus["lost"] ?? 0;
  const closed = bound + lost;

  // Premium sourced (bound/delivered deals with a premium recorded), per partner.
  const SAFE = new Set(["bound", "docs_delivered"]);
  let premiumTotal = 0;
  const byPartner = new Map<string, { name: string; premium: number; referred: number; bound: number }>();
  for (const r of refs as any[]) {
    const name = r.partners?.name ?? "Unknown";
    const row = byPartner.get(name) ?? { name, premium: 0, referred: 0, bound: 0 };
    row.referred++;
    if (SAFE.has(r.status)) {
      row.bound++;
      if (typeof r.premium === "number") {
        row.premium += r.premium;
        premiumTotal += r.premium;
      }
    }
    byPartner.set(name, row);
  }
  const partnerBreakdown = [...byPartner.values()].sort((a, b) => b.premium - a.premium);

  return NextResponse.json({
    total: refs.length,
    byStatus,
    premiumTotal,
    partnerBreakdown,
    fromPartnerPortal: refs.filter((r) => r.source === "partner").length,
    avgLogSeconds: avgLog !== null ? Math.round(avgLog * 10) / 10 : null,
    avgHoursToBound: avgHoursToBound !== null ? Math.round(avgHoursToBound * 10) / 10 : null,
    conversionRate: closed > 0 ? Math.round((bound / closed) * 100) : null,
    emailsSent: ems.filter((e) => e.sent).length,
    emailsLogged: ems.length,
    statusUpdates: evs.length,
  });
}
