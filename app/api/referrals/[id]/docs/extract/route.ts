import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { askClaude, parseJsonLoose, mediaTypeFor } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { DOC_KINDS } from "@/lib/config";
import { getAccount, ownedReferral } from "@/lib/account";
import { recordContactFromDoc } from "@/lib/radar";
import { ORIGINATOR_DOC_KINDS } from "@/lib/config";
import { autoMatchClause } from "@/lib/clauses";

// Agent-only (protected by middleware): extract structured details from an
// uploaded document (loan document, dec page, EOI, HOI request…) and fill EMPTY fields
// on the referral / document record. Existing values are never overwritten —
// conflicts are reported as mismatches instead.

const SYSTEM = `You extract structured data from insurance and mortgage documents
(loan documents, HOI requests, declarations pages, EOIs, mortgagee clauses).

Rules:
- Extract ONLY what is explicitly present in the document. Never guess or infer.
- Use null for anything not clearly present.
- Dates in ISO format (YYYY-MM-DD). Phone as digits with punctuation as written.
- CRITICAL: a mortgagee, lienholder, loss payee, servicer, or any "ISAOA/ATIMA"
  entity is NOT a loan officer. On an evidence of insurance, declarations page,
  or replacement cost estimate, the only lender-shaped name present is the
  mortgagee — the servicer who holds the note, not the person who originated it.
  Put that in mortgagee_name and leave every loan_officer_* field null. Only
  fill loan_officer_* when a named individual originator appears, which in
  practice means a loan application, a pre-approval, or an insurance request.
- premium is the annual premium as a plain number (no $ or commas), null if absent.

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "client_name": string|null,        // primary borrower / named insured
  "coborrower_name": string|null,
  "client_phone": string|null,
  "client_email": string|null,
  "client_dob": string|null,
  "coborrower_dob": string|null,
  "property_address": string|null,   // full one-line address of the subject/insured property
  "closing_date": string|null,
  "carrier_name": string|null,       // insurance carrier named on the document
  "premium": number|null,
  "policy_lines": string|null,       // e.g. "Homeowners", "Home + Flood"
  "effective_start": string|null,    // policy effective date
  "effective_end": string|null,      // policy expiration date
  "loan_officer_name": string|null,    // ONLY a named human loan officer / originator. null on anything else.
  "loan_officer_company": string|null, // the ORIGINATING lender or brokerage that person works for
  "loan_officer_email": string|null,
  "loan_officer_phone": string|null,
  "loan_officer_nmls": string|null,    // NMLS ID if shown
  "loan_type": string|null,            // FHA, VA, USDA, Conventional, Jumbo, Portfolio — only if stated
  "investor": string|null,             // investor / servicer named on the file, if stated
  "mortgagee_name": string|null,       // mortgagee / lienholder / loss payee exactly as printed
  "doc_summary": string              // one sentence: what this document is
}`;

// Referral fields we fill when empty / compare when not
const REFERRAL_FIELDS = [
  "coborrower_name",
  "client_phone",
  "client_email",
  "client_dob",
  "coborrower_dob",
  "property_address",
  "closing_date",
  "premium",
  "policy_lines",
] as const;

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const documentId = String(body?.document_id ?? "");
  if (!documentId) return NextResponse.json({ error: "document_id is required" }, { status: 400 });

  const { data: doc } = await db()
    .from("documents")
    .select("id, kind, file_name, storage_path, carrier_name, effective_start, effective_end, referral_id")
    .eq("id", documentId)
    .eq("referral_id", params.id)
    .single();
  if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });

  const mediaType = mediaTypeFor(doc.file_name);
  if (!mediaType) {
    return NextResponse.json(
      { error: "Extraction works on PDF and image files. Word/Excel files aren't supported yet." },
      { status: 400 }
    );
  }

  const { data: referral } = await db()
    .from("referrals")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!referral) return NextResponse.json({ error: "referral not found" }, { status: 404 });

  const { data: blob, error: dlErr } = await db().storage.from(DOCS_BUCKET).download(doc.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? "couldn't read file" }, { status: 500 });
  }
  const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  let extracted: any;
  try {
    const raw = await askClaude({
      system: SYSTEM,
      content: [
        mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: mediaType, data: b64 } }
          : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
        { type: "text", text: `Document type hint from uploader: ${DOC_KINDS[doc.kind] ?? doc.kind}` },
      ],
      maxTokens: 1000,
    });
    extracted = parseJsonLoose(raw);
  } catch (e: any) {
    return NextResponse.json({ error: `Extraction failed: ${e.message}` }, { status: 500 });
  }

  // Fill empty referral fields; report conflicts on filled ones.
  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  const mismatches: string[] = [];

  for (const f of REFERRAL_FIELDS) {
    const newVal = extracted[f];
    if (newVal === null || newVal === undefined || newVal === "") continue;
    const current = (referral as any)[f];
    if (current === null || current === undefined || current === "") {
      patch[f] = newVal;
      filled.push(f.replace(/_/g, " "));
    } else if (norm(current) !== norm(newVal)) {
      mismatches.push(`${f.replace(/_/g, " ")}: referral has “${current}”, document says “${newVal}”`);
    }
  }
  // Client name: never overwrite, but flag a real mismatch.
  if (extracted.client_name && norm(extracted.client_name) !== norm(referral.client_name)) {
    mismatches.push(`client name: referral has “${referral.client_name}”, document says “${extracted.client_name}”`);
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    await db().from("referrals").update(patch).eq("id", params.id);
  }

  // Document metadata fill-if-empty
  const docPatch: Record<string, unknown> = {};
  if (!doc.carrier_name && extracted.carrier_name) docPatch.carrier_name = extracted.carrier_name;
  if (!doc.effective_start && extracted.effective_start) docPatch.effective_start = extracted.effective_start;
  if (!doc.effective_end && extracted.effective_end) docPatch.effective_end = extracted.effective_end;
  if (Object.keys(docPatch).length > 0) {
    await db().from("documents").update(docPatch).eq("id", doc.id);
    filled.push(...Object.keys(docPatch).map((k) => `document ${k.replace(/_/g, " ")}`));
  }

  // A named person on this document who belongs to a partner the agent already
  // has, but isn't on that partner's contact list, gets flagged — their leads
  // would otherwise land unattributed. Only documents an ORIGINATOR signs are
  // read this way: an EOI, dec page or RCE carries the mortgagee, which is a
  // national servicer, not somebody's colleague. Best-effort, never blocking.
  if (ORIGINATOR_DOC_KINDS.includes(doc.kind)) {
    await recordContactFromDoc(account.id, extracted);
  }

  // Match the file to the right mortgagee clause from the processor's library.
  // Never overwrites a clause a processor set by hand — they know something the
  // document doesn't.
  await autoMatchClause(doc.referral_id, {
    loanType: extracted.loan_type ?? null,
    investor: extracted.investor ?? null,
    text: extracted.doc_summary ?? null,
  });

  await logActivity(
    params.id,
    "document_uploaded",
    `AI read ${doc.file_name}: ${extracted.doc_summary ?? "extracted details"}${
      filled.length ? ` — filled ${filled.join(", ")}` : " — nothing new to fill"
    }`,
    "system"
  );

  return NextResponse.json({
    filled,
    mismatches,
    summary: extracted.doc_summary ?? null,
  });
}
