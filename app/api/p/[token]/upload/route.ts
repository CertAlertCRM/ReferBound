import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { DOC_KINDS } from "@/lib/config";
import { logActivity } from "@/lib/activity";

// Public (token-guarded): partner uploads a document (1003, HOI request,
// mortgagee info, etc.) onto one of THEIR OWN referrals.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  const file = form.get("file") as File | null;
  const referralId = String(form.get("referral_id") || "");
  const kind = String(form.get("kind") || "other");
  if (!file || !referralId) {
    return NextResponse.json({ error: "file and referral_id are required" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (15MB max)" }, { status: 400 });
  }

  // Ownership check: the referral must belong to this partner's token.
  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name")
    .eq("id", referralId)
    .eq("partner_id", partner.id)
    .single();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `${referral.id}/${Date.now()}-partner-${kind}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db()
    .storage.from(DOCS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error } = await db().from("documents").insert({
    referral_id: referral.id,
    kind,
    file_name: safeName,
    storage_path: path,
    uploaded_by: "partner",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    referral.id,
    "document_uploaded",
    `${partner.name} uploaded ${DOC_KINDS[kind] ?? kind} (${safeName})`,
    "partner"
  );

  return NextResponse.json({ ok: true });
}
