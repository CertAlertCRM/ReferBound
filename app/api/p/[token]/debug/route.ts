import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// TEMPORARY diagnostic route for the pilot — visit /api/p/<partner-token>/debug
// to see exactly what the deployed app's Supabase connection returns.
// Delete this file once the portal issue is resolved.

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const out: Record<string, unknown> = {};

  // Which Supabase project is this deployment actually pointed at?
  try {
    out.supabaseHost = new URL(process.env.SUPABASE_URL ?? "missing").host;
  } catch {
    out.supabaseHost = `unparseable: ${process.env.SUPABASE_URL ?? "missing"}`;
  }

  const { data: partner, error: partnerErr } = await db()
    .from("partners")
    .select("id, name, token")
    .eq("token", params.token)
    .single();
  out.partner = partner ?? null;
  out.partnerError = partnerErr?.message ?? null;

  if (partner) {
    const { data: withEmbed, error: embedErr } = await db()
      .from("referrals")
      .select("id, client_name, status, created_at, documents(id, kind, file_name)")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false });
    out.referralsWithDocsEmbed = withEmbed ?? null;
    out.embedError = embedErr?.message ?? null;

    const { data: plain, error: plainErr } = await db()
      .from("referrals")
      .select("id, client_name, status, partner_id")
      .eq("partner_id", partner.id);
    out.referralsPlain = plain ?? null;
    out.plainError = plainErr?.message ?? null;

    const { count, error: countErr } = await db()
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partner.id);
    out.referralCount = count;
    out.countError = countErr?.message ?? null;
  }

  const { data: allRefs, error: allErr } = await db()
    .from("referrals")
    .select("id, client_name, partner_id");
  out.allReferrals = allRefs ?? null;
  out.allReferralsError = allErr?.message ?? null;

  return NextResponse.json(out);
}
