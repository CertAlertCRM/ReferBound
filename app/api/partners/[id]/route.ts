import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Agent-only (protected by middleware): edit a partner's name / notification emails.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
      .map((e: string) => e.trim())
      .filter((e: string) => e.includes("@"));
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("partners")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}
