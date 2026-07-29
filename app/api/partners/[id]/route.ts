import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EMAIL_RE } from "@/lib/format";
import { PARTNER_TYPES } from "@/lib/config";
import { getAccount } from "@/lib/account";

// Agent-only (protected by middleware): edit a partner's name / notification emails.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    patch.name = name;
  }
  if ("emails" in body) {
    patch.emails = String(body.emails ?? "")
      .split(/[,;\s]+/)
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => EMAIL_RE.test(e));
  }
  if ("partner_type" in body && PARTNER_TYPES[body.partner_type]) {
    patch.partner_type = body.partner_type;
  }
  if ("monthly_summary" in body) {
    patch.monthly_summary = Boolean(body.monthly_summary);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("partners")
    .update(patch)
    .eq("id", params.id)
    .eq("account_id", account.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}
