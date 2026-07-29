import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { EMAIL_RE } from "@/lib/format";
import { PARTNER_TYPES } from "@/lib/config";
import { getAccount, partnerLimit } from "@/lib/account";

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await db()
    .from("partners")
    .select("id, name, token, short_code, emails, logo_path, partner_type, monthly_summary, thankyou_cadence, created_at, referrals(count)")
    .eq("account_id", account.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const partners = await Promise.all(
    (data ?? []).map(async (p) => {
      let logoUrl: string | null = null;
      if (p.logo_path) {
        const { data: signed } = await db()
          .storage.from(DOCS_BUCKET)
          .createSignedUrl(p.logo_path, 60 * 60);
        logoUrl = signed?.signedUrl ?? null;
      }
      return { ...p, logoUrl };
    })
  );
  return NextResponse.json({ partners });
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Plan enforcement: Free = 1 partner, full features.
  const limit = partnerLimit(account.plan);
  if (limit !== null) {
    const { count } = await db()
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id);
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        {
          error: "The Free plan includes 1 partner. Upgrade to Pro for unlimited partners.",
          upgrade: true,
        },
        { status: 402 }
      );
    }
  }
  const emails = String(body.emails ?? "")
    .split(/[,;\s]+/)
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => EMAIL_RE.test(e));
  const partner_type = PARTNER_TYPES[body.partner_type] ? body.partner_type : "lender";
  const { data, error } = await db()
    .from("partners")
    .insert({ name: body.name.trim(), emails, partner_type, account_id: account.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}
