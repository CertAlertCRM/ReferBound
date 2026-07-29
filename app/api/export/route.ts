import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { STATUS_LABELS } from "@/lib/config";

export const dynamic = "force-dynamic";

// CSV export of every referral on the account — opens directly in Excel /
// Google Sheets, and imports into any AMS or CRM that accepts a file.

const COLUMNS: [string, (r: any) => unknown][] = [
  ["Client name", (r) => r.client_name],
  ["Co-borrower", (r) => r.coborrower_name],
  ["Phone", (r) => r.client_phone],
  ["Email", (r) => r.client_email],
  ["Date of birth", (r) => r.client_dob],
  ["Property address", (r) => r.property_address],
  ["Closing date", (r) => r.closing_date],
  ["Status", (r) => STATUS_LABELS[r.status] ?? r.status],
  ["Lost reason", (r) => r.lost_reason],
  ["Referral partner", (r) => r.partners?.name],
  ["Partner type", (r) => r.partners?.partner_type],
  ["Source", (r) => (r.source === "partner" ? "Partner portal" : "Agent")],
  ["Annual premium", (r) => r.premium],
  ["Lines written", (r) => r.policy_lines],
  ["Notes", (r) => r.notes],
  ["Referred on", (r) => (r.created_at ? String(r.created_at).slice(0, 10) : "")],
  ["Last updated", (r) => (r.updated_at ? String(r.updated_at).slice(0, 10) : "")],
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Guard against spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db()
    .from("referrals")
    .select("*, partners(name, partner_type)")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [
    COLUMNS.map(([h]) => csvCell(h)).join(","),
    ...(data ?? []).map((r) => COLUMNS.map(([, fn]) => csvCell(fn(r))).join(",")),
  ];
  // UTF-8 BOM so Excel opens accented names (é, ñ …) correctly.
  const csv = "\uFEFF" + rows.join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="referbound-referrals-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
