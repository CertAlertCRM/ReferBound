import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { DOC_KINDS } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getAccount, ownedReferral } from "@/lib/account";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
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

  const carrier_name = String(form.get("carrier_name") || "").trim() || null;
  const effective_start = String(form.get("effective_start") || "").trim() || null;
  const effective_end = String(form.get("effective_end") || "").trim() || null;

  const { data, error } = await db()
    .from("documents")
    .insert({
      referral_id: params.id,
      kind,
      file_name: safeName,
      storage_path: path,
      carrier_name,
      effective_start,
      effective_end,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    params.id,
    "document_uploaded",
    `${DOC_KINDS[kind] ?? kind} uploaded (${safeName})${carrier_name ? ` — ${carrier_name}` : ""}${
      effective_end ? `, effective through ${effective_end}` : ""
    }`,
    "agent"
  );

  return NextResponse.json({ document: data });
}
