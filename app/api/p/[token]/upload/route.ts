import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { DOC_KINDS, shouldPersistDoc } from "@/lib/config";
import { extractFromAttachment, applyExtractedToReferral } from "@/lib/inbound-docs";
import { autoMatchClause } from "@/lib/clauses";
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

  // Same rule wherever a loan application enters: read it, use it, don't keep
  // it. The processor who sent it still has it; the agent never needed a copy.
  if (!shouldPersistDoc(kind)) {
    const fields = await extractFromAttachment(buf, safeName).catch(() => null);
    const filled = await applyExtractedToReferral(referral.id, fields);
    if (fields) {
      await autoMatchClause(referral.id, {
        loanType: fields.loan_type ?? null,
        investor: fields.investor ?? null,
        text: fields.loan_number ?? null,
      });
    }
    await logActivity(
      referral.id,
      "document_uploaded",
      `${partner.name} sent ${safeName} — read and discarded; loan applications aren't stored.${
        filled.length > 0 ? ` Filled in ${filled.join(", ")}.` : ""
      }`,
      "partner"
    );
    return NextResponse.json({ ok: true, discarded: true, filled });
  }

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
