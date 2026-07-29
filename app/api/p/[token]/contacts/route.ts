import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public (token-guarded): the partner team's known contacts, for the
// "who's sending this?" picker on the submit form. Names only + ids — email
// addresses are not exposed to the portal.

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  const { data: partner } = await db()
    .from("partners")
    .select("id")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data } = await db()
    .from("partner_contacts")
    .select("id, name, role")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: true });
  return NextResponse.json({ contacts: data ?? [] });
}
