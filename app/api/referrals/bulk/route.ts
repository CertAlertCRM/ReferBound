import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { STATUSES } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { normalizePhone } from "@/lib/format";

export const dynamic = "force-dynamic";

// Backfill: create many referrals at once so an agent can get their real book
// into ReferBound in minutes instead of an evening. Powers rapid entry, CSV
// import, and AI paste — all three end up here.
//
// Backfilled leads are flagged so speed metrics stay honest: a deal you logged
// today but quoted three weeks ago would otherwise report a fake "3 weeks to
// quote" on your partner's scorecard.

const MAX_ROWS = 200;

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "no rows" }, { status: 400 });
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `That's ${rows.length} leads — import up to ${MAX_ROWS} at a time.` }, { status: 400 });
  }

  // Resolve partners by id or by name, so a CSV with "Cowart Home Loans" in
  // the partner column just works.
  const { data: partners } = await db()
    .from("partners")
    .select("id, name")
    .eq("account_id", account.id);
  const byId = new Map((partners ?? []).map((p) => [p.id, p.id]));
  const byName = new Map((partners ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));

  const inserts: Record<string, unknown>[] = [];
  const skipped: string[] = [];

  for (const [i, r] of rows.entries()) {
    const client_name = String(r.client_name ?? "").trim();
    if (!client_name) {
      skipped.push(`Row ${i + 1}: no client name`);
      continue;
    }
    const rawPartner = String(r.partner ?? r.partner_id ?? "").trim();
    const partner_id =
      byId.get(rawPartner) ?? byName.get(rawPartner.toLowerCase()) ?? null;
    if (!partner_id) {
      skipped.push(`${client_name}: no partner match for “${rawPartner || "(blank)"}”`);
      continue;
    }
    const status = STATUSES.includes(r.status) || r.status === "lost" ? r.status : "new";
    const premiumNum = Number(String(r.premium ?? "").replace(/[^0-9.]/g, ""));

    inserts.push({
      account_id: account.id,
      partner_id,
      client_name,
      client_phone: r.client_phone ? normalizePhone(String(r.client_phone)) : null,
      client_email: String(r.client_email ?? "").trim() || null,
      property_address: String(r.property_address ?? "").trim() || null,
      closing_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.closing_date ?? "")) ? r.closing_date : null,
      notes: String(r.notes ?? "").trim() || null,
      premium: Number.isFinite(premiumNum) && premiumNum > 0 ? premiumNum : null,
      status,
      source: "agent",
      backfilled: true,
    });
  }

  if (inserts.length === 0) {
    return NextResponse.json({ created: 0, skipped }, { status: 200 });
  }

  const { data, error } = await db().from("referrals").insert(inserts).select("id, client_name, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Timeline entry each, and a status event so the pipeline view is correct.
  for (const ref of data ?? []) {
    await logActivity(ref.id, "lead_logged", `${ref.client_name} added while building the book`, "agent");
    if (ref.status !== "new") {
      await db().from("status_events").insert({ referral_id: ref.id, status: ref.status });
    }
  }

  return NextResponse.json({ created: data?.length ?? 0, skipped });
}
