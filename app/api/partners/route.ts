import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";

export async function GET() {
  const { data, error } = await db()
    .from("partners")
    .select("id, name, token, emails, logo_path, created_at, referrals(count)")
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
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const emails = String(body.emails ?? "")
    .split(/[,;\s]+/)
    .map((e: string) => e.trim())
    .filter((e: string) => e.includes("@"));
  const { data, error } = await db()
    .from("partners")
    .insert({ name: body.name.trim(), emails })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}
