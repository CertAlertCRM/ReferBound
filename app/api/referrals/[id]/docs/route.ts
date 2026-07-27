import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") || "other");
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (15MB max)" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `${params.id}/${Date.now()}-${kind}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db()
    .storage.from(DOCS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await db()
    .from("documents")
    .insert({ referral_id: params.id, kind, file_name: safeName, storage_path: path })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: data });
}
