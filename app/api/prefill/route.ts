import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { askClaude, parseJsonLoose, mediaTypeFor } from "@/lib/ai";
import { normalizePhone } from "@/lib/format";
import { recordProspectFromDoc } from "@/lib/radar";

export const dynamic = "force-dynamic";

// Agent-side prefill: same magic as the partner portal's docs-first flow.
// The agent drops the 1003 an LO emailed them, the log-lead form fills
// itself. Nothing is stored here — the file attaches to the referral after
// it's created.

const SYSTEM = `You extract client details from mortgage and insurance documents
(loan applications/1003s, HOI requests, pre-approvals, etc.) so a referral form
can be prefilled.

Rules:
- Extract ONLY what is explicitly present. Never guess. Use null when absent.
- Dates in ISO format (YYYY-MM-DD).

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "client_name": string|null,       // primary borrower
  "coborrower_name": string|null,
  "client_phone": string|null,
  "client_email": string|null,
  "client_dob": string|null,
  "property_address": string|null,  // subject property, one line
  "closing_date": string|null,
  "loan_officer_name": string|null,    // originating loan officer / agent named on the document
  "loan_officer_company": string|null, // their lender / brokerage / company name
  "loan_officer_email": string|null,
  "loan_officer_phone": string|null,
  "loan_officer_nmls": string|null     // NMLS ID if shown
}`;

// Fields that belong to the referral form — the loan-officer block feeds
// Referral Radar instead and is stripped before the form sees it.
const FORM_FIELDS = [
  "client_name",
  "coborrower_name",
  "client_phone",
  "client_email",
  "client_dob",
  "property_address",
  "closing_date",
] as const;

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (15MB max)" }, { status: 400 });
  }
  const mediaType = mediaTypeFor(file.name);
  if (!mediaType) {
    return NextResponse.json({ error: "unsupported file type for auto-fill (PDF, PNG, or JPG)" }, { status: 400 });
  }

  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const raw = await askClaude({
      system: SYSTEM,
      content: [
        mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: mediaType, data: b64 } }
          : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
      ],
      maxTokens: 500,
    });
    const extracted = parseJsonLoose(raw);
    if (extracted.client_phone) extracted.client_phone = normalizePhone(extracted.client_phone);

    // Radar: the LO on this 1003 may be someone who already sends this agent
    // work but was never set up as a partner.
    await recordProspectFromDoc(account.id, extracted);

    const fields: Record<string, unknown> = {};
    for (const f of FORM_FIELDS) fields[f] = extracted[f] ?? null;
    return NextResponse.json({ fields });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
