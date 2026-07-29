import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

const SAFE = new Set(["bound", "docs_delivered"]);

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = db();

  const { data: referrals } = await s
    .from("referrals")
    .select("id, status, source, log_seconds, created_at, premium, partner_id, partners(name)")
    .eq("account_id", account.id);
  const refs = referrals ?? [];
  const refIds = refs.map((r) => r.id);

  // Events and emails scoped to THIS account's referrals.
  const [{ data: events }, { data: emails }] = await Promise.all([
    refIds.length
      ? s.from("status_events").select("referral_id, status, created_at").in("referral_id", refIds)
      : Promise.resolve({ data: [] as any[] }),
    refIds.length
      ? s.from("email_log").select("kind, sent, created_at").in("referral_id", refIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const evs = events ?? [];
  const ems = emails ?? [];

  const byStatus: Record<string, number> = {};
  for (const r of refs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  const logTimes = refs.map((r) => r.log_seconds).filter((x): x is number => typeof x === "number");
  const avgLog = logTimes.length ? logTimes.reduce((a, b) => a + b, 0) / logTimes.length : null;

  // Time from first "new" event to first "bound" event, per referral.
  const firstNew: Record<string, number> = {};
  const firstBound: Record<string, number> = {};
  for (const e of evs) {
    const t = new Date(e.created_at).getTime();
    if (e.status === "new" && !(e.referral_id in firstNew)) firstNew[e.referral_id] = t;
    if (e.status === "bound" && !(e.referral_id in firstBound)) firstBound[e.referral_id] = t;
  }
  const hoursToBound: Record<string, number> = {};
  for (const id of Object.keys(firstBound)) {
    if (id in firstNew) hoursToBound[id] = (firstBound[id] - firstNew[id]) / 3600000;
  }
  const boundDurations = Object.values(hoursToBound);
  const avgHoursToBound = boundDurations.length
    ? boundDurations.reduce((a, b) => a + b, 0) / boundDurations.length
    : null;

  const bound = (byStatus["bound"] ?? 0) + (byStatus["docs_delivered"] ?? 0);
  const lost = byStatus["lost"] ?? 0;
  const closed = bound + lost;

  // ── Per-partner ROI ────────────────────────────────────────────────────────
  type PartnerRow = {
    name: string;
    premium: number;
    referred: number;
    bound: number;
    lost: number;
    closeRatio: number | null; // bound / (bound + lost)
    avgDaysToBound: number | null;
  };
  let premiumTotal = 0;
  const byPartner = new Map<string, PartnerRow & { boundHours: number[] }>();
  for (const r of refs as any[]) {
    const name = r.partners?.name ?? "Unknown";
    const row =
      byPartner.get(name) ??
      ({ name, premium: 0, referred: 0, bound: 0, lost: 0, closeRatio: null, avgDaysToBound: null, boundHours: [] } as any);
    row.referred++;
    if (SAFE.has(r.status)) {
      row.bound++;
      if (typeof r.premium === "number") {
        row.premium += r.premium;
        premiumTotal += r.premium;
      }
      if (r.id in hoursToBound) row.boundHours.push(hoursToBound[r.id]);
    }
    if (r.status === "lost") row.lost++;
    byPartner.set(name, row);
  }
  const partnerBreakdown = Array.from(byPartner.values())
    .map(({ boundHours, ...p }) => ({
      ...p,
      closeRatio: p.bound + p.lost > 0 ? Math.round((p.bound / (p.bound + p.lost)) * 100) : null,
      avgDaysToBound: boundHours.length
        ? Math.round((boundHours.reduce((a: number, b: number) => a + b, 0) / boundHours.length / 24) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.premium - a.premium || b.bound - a.bound || b.referred - a.referred);

  // ── Last 6 months trend ────────────────────────────────────────────────────
  // Referred by created_at month; bound by first bound-event month; premium
  // credited to the bound month.
  const now = new Date();
  const months: { key: string; label: string; referred: number; bound: number; premium: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      referred: 0,
      bound: 0,
      premium: 0,
    });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  const keyOf = (iso: string) => iso.slice(0, 7);
  const premiumByRef = new Map(refs.map((r) => [r.id, typeof r.premium === "number" ? r.premium : 0]));
  for (const r of refs) {
    const i = monthIndex.get(keyOf(r.created_at));
    if (i !== undefined) months[i].referred++;
  }
  for (const [id, t] of Object.entries(firstBound)) {
    const i = monthIndex.get(keyOf(new Date(t).toISOString()));
    if (i !== undefined) {
      months[i].bound++;
      months[i].premium += premiumByRef.get(id) ?? 0;
    }
  }

  return NextResponse.json({
    total: refs.length,
    byStatus,
    premiumTotal,
    partnerBreakdown,
    monthly: months.map(({ key, ...m }) => m),
    fromPartnerPortal: refs.filter((r) => r.source === "partner").length,
    avgLogSeconds: avgLog !== null ? Math.round(avgLog * 10) / 10 : null,
    avgHoursToBound: avgHoursToBound !== null ? Math.round(avgHoursToBound * 10) / 10 : null,
    conversionRate: closed > 0 ? Math.round((bound / closed) * 100) : null,
    emailsSent: ems.filter((e) => e.sent).length,
    emailsLogged: ems.length,
    statusUpdates: evs.length,
  });
}
