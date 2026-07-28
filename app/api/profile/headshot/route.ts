import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";

// Agent-only (protected by middleware): upload/replace the profile headshot.

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "headshot must be an image" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "image too large (5MB max)" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `profile/${Date.now()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db()
    .storage.from(DOCS_BUCKET)
    .upload(path, buf, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error } = await db()
    .from("agent_profile")
    .upsert({ id: "default", headshot_path: path, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: signed } = await db()
    .storage.from(DOCS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return NextResponse.json({ headshotUrl: signed?.signedUrl ?? null });
}
