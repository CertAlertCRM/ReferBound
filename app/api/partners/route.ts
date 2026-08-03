import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { EMAIL_RE } from "@/lib/format";
import { PARTNER_TYPES, SAFE_STATUSES } from "@/lib/config";
import { getAccount, partnerCapacity, countPartners } from "@/lib/account";

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await db()
    .from("partners")
    .select("id, name, token, short_code, emails, logo_path, partner_type, type_label, monthly_summary, thankyou_cadence, requirements, created_at, referrals(count)")
    .eq("account_id", account.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pipeline per partner, in one query rather than one per card. A partner card
  // that only says "7 referrals" tells an agent nothing they wanted to know —
  // what's live right now, what closed, and whether this relationship has gone
  // quiet are the questions actually being asked of this page.
  const { data: refs } = await db()
    .from("referrals")
    .select("partner_id, status, created_at, updated_at")
    .eq("account_id", account.id);

  type Stats = {
    total: number;
    active: number;
    bound: number;
    lost: number;
    byStatus: Record<string, number>;
    lastAt: string | null;
  };
  const blank = (): Stats => ({ total: 0, active: 0, bound: 0, lost: 0, byStatus: {}, lastAt: null });
  const stats = new Map<string, Stats>();
  for (const r of (refs ?? []) as any[]) {
    if (!r.partner_id) continue;
    if (!stats.has(r.partner_id)) stats.set(r.partner_id, blank());
    const s = stats.get(r.partner_id)!;
    s.total++;
    s.byStatus[r.status] = (s.byStatus[r.status] ?? 0) + 1;
    if (r.status === "lost") s.lost++;
    else if (SAFE_STATUSES.includes(r.status)) s.bound++;
    else s.active++;
    const stamp = r.updated_at ?? r.created_at;
    if (stamp && (!s.lastAt || stamp > s.lastAt)) s.lastAt = stamp;
  }

  const partners = await Promise.all(
    (data ?? []).map(async (p) => {
      let logoUrl: string | null = null;
      if (p.logo_path) {
        const { data: signed } = await db()
          .storage.from(DOCS_BUCKET)
          .createSignedUrl(p.logo_path, 60 * 60);
        logoUrl = signed?.signedUrl ?? null;
      }
      const s = stats.get(p.id) ?? blank();
      // Close ratio counts decided deals only. Counting live files as losses
      // makes a good week look like a bad one.
      const decided = s.bound + s.lost;
      return {
        ...p,
        logoUrl,
        stats: {
          ...s,
          closeRate: decided > 0 ? Math.round((s.bound / decided) * 100) : null,
        },
      };
    })
  );
  return NextResponse.json({ partners });
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const wantType = PARTNER_TYPES[body.partner_type] ? String(body.partner_type) : "lender";

  // Plan enforcement, counted by kind: the lender seat is the one worth paying
  // for, so free leaves room for a couple of other referral sources.
  const capacity = await partnerCapacity(account.id, account.plan, wantType, countPartners(account.id));
  if (!capacity.ok) {
    return NextResponse.json({ error: capacity.error, upgrade: true }, { status: 402 });
  }

  const emails = String(body.emails ?? "")
    .split(/[,;\s]+/)
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => EMAIL_RE.test(e));
  const partner_type = wantType;
  // Custom display label only makes sense with "Other" — the built-in types
  // already have names, and flow logic keys off partner_type either way.
  const type_label =
    partner_type === "other" ? String(body.type_label ?? "").trim().slice(0, 40) || null : null;
  const { data, error } = await db()
    .from("partners")
    .insert({ name: body.name.trim(), emails, partner_type, type_label, account_id: account.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}

