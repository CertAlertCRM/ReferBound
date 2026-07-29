import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { getAccount } from "@/lib/account";

// Agent-only (protected by middleware): upload/replace a partner's logo.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: owned } = await db()
    .from("partners")
    .select("id")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "logo must be an image" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "image too large (2MB max)" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `logos/${params.id}-${Date.now()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db()
    .storage.from(DOCS_BUCKET)
    .upload(path, buf, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error } = await db().from("partners").update({ logo_path: path }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: signed } = await db()
    .storage.from(DOCS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return NextResponse.json({ logoUrl: signed?.signedUrl ?? null });
}
