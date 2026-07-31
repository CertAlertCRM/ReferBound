import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { askClaude, parseJsonLoose, mediaTypeFor } from "@/lib/ai";
import { normalizePhone } from "@/lib/format";

export const dynamic = "force-dynamic";

// One document in, one reviewable lead row out — the backfill path for closed
// business. An agent points at a folder of past EOIs or dec pages and each one
// becomes a bound deal on the right partner's portal.
//
// Nothing is stored here. The file rides along in the browser and is attached
// to the referral only after the agent reviews and saves.

const SYSTEM = `You read a finished insurance document (Evidence of Insurance,
declarations page, or policy summary) and produce one referral row so an agent
can rebuild their past book of business.

Respond with ONLY a JSON object (no fences):
{
  "client_name": string|null,        // named insured (primary only)
  "property_address": string|null,   // insured property, one line
  "client_phone": string|null,
  "carrier_name": string|null,
  "premium": number|null,            // annual premium as a plain number
  "effective_start": string|null,    // YYYY-MM-DD
  "lender_name": string|null,        // mortgagee / lienholder / loss payee as written
  "doc_kind": string                 // one of: eoi, dec, other
}

Rules:
- Extract ONLY what is explicitly present. Never guess or infer. Use null when absent.
- lender_name: the mortgagee clause company — this is how the agent matches the
  deal back to the referral partner who sent it. Copy the company name only,
  not the address or loan number.
- Do not extract Social Security numbers, income, or any borrower financial
  detail even if present on the page. They are never wanted.`;

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
    return NextResponse.json({ error: "PDF, PNG, or JPG only" }, { status: 400 });
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
      maxTokens: 600,
    });
    const x = parseJsonLoose(raw);
    return NextResponse.json({
      row: {
        client_name: x.client_name ?? "",
        property_address: x.property_address ?? "",
        client_phone: x.client_phone ? normalizePhone(String(x.client_phone)) : "",
        premium: x.premium != null ? String(x.premium) : "",
        carrier_name: x.carrier_name ?? "",
        // Effective date is the closest honest stand-in for when this deal
        // closed — the agent can correct it in the review grid.
        closing_date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.effective_start ?? "")) ? x.effective_start : "",
        // Mortgagee is usually the lender who referred the client.
        partner: x.lender_name ?? "",
        doc_kind: ["eoi", "dec"].includes(String(x.doc_kind)) ? x.doc_kind : "eoi",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
