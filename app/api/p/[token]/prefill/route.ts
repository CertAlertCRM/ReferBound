import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { askClaude, parseJsonLoose, mediaTypeFor } from "@/lib/ai";
import { normalizePhone } from "@/lib/format";

// Public (token-guarded): read a document the partner is ABOUT to attach and
// return extracted fields to prefill the submission form. Nothing is stored
// here — the file itself is uploaded through the normal flow after submit.

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
  "closing_date": string|null
}`;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (15MB max)" }, { status: 400 });
  }
  const mediaType = mediaTypeFor(file.name);
  if (!mediaType) {
    return NextResponse.json({ error: "unsupported file type for auto-fill" }, { status: 400 });
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
    return NextResponse.json({ fields: extracted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
