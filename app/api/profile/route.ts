import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";

// Agent-only (protected by middleware): read/update the agent's profile.

export async function GET() {
  const { data: profile, error } = await db()
    .from("agent_profile")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let headshotUrl: string | null = null;
  if (profile?.headshot_path) {
    const { data: signed } = await db()
      .storage.from(DOCS_BUCKET)
      .createSignedUrl(profile.headshot_path, 60 * 60);
    headshotUrl = signed?.signedUrl ?? null;
  }
  return NextResponse.json({ profile: profile ?? null, headshotUrl });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const row: Record<string, unknown> = { id: "default", updated_at: new Date().toISOString() };
  for (const f of ["display_name", "agency_name", "office", "phone", "email"]) {
    if (f in body) row[f] = String(body[f] ?? "").trim() || null;
  }

  const { data, error } = await db().from("agent_profile").upsert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
