import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { clauseForReferral } from "@/lib/clauses";
import { askClaude, parseJsonLoose, mediaTypeFor } from "@/lib/ai";
import { DOC_KINDS } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getAccount, ownedReferral } from "@/lib/account";

export const dynamic = "force-dynamic";

// Pre-delivery cross-check. Reads what the LENDER sent (loan application, HOI
// request, mortgagee clause) and what the AGENT is about to deliver (EOI, RCE,
// dec page) and compares the fields that cause real closing problems when they
// disagree: named insured and co-borrower, property address, mortgagee clause,
// loan number, effective date, and dwelling coverage against replacement cost.
//
// Bias is strongly toward silence: a finding only counts when both sides show
// a value and those values genuinely conflict. Formatting differences are not
// findings — a checker that cries wolf gets ignored, and then it's worse than
// no checker at all.

const LENDER_KINDS = ["loan_1003", "hoi_request", "mortgagee"];
const AGENT_KINDS = ["eoi", "rce", "dec"];
const MAX_DOCS = 6;
const MAX_BYTES = 6 * 1024 * 1024;

const SYSTEM = `You are the last set of eyes before an insurance agent sends
proof of insurance to a mortgage lender. You compare the agent's documents
(Evidence of Insurance, Replacement Cost Estimator, declarations page) against
the lender's documents (loan application, homeowners insurance request,
mortgagee clause) and report only real, consequential discrepancies.

Check these, and only these:
- named_insured: do the names on the EOI match the borrower(s)? A CO-BORROWER
  present on the loan documents but missing from the policy is a blocker.
- property_address: is the insured location the same as the subject property?
- mortgagee_clause: does the mortgagee/lienholder name and address on the EOI
  match what the lender specified, including ISAOA/ATIMA wording when given?
- loan_number: does the loan number on the EOI match the lender's?
- effective_date: is coverage effective on or before the closing/funding date?
  Coverage starting AFTER closing is a blocker.
- dwelling_coverage: if both an RCE replacement cost and a Coverage A limit are
  present, is Coverage A at least the replacement cost? Below it is a warning.

When "lenderRequirements" is supplied, treat it as this lender's stated policy
and check the agent's documents against it directly — it outranks anything
inferred from a document:
- mortgagee_clause: the EOI must carry this wording. Wrong company or wrong
  address is a blocker; a missing ISAOA/ATIMA when the lender specifies it is a
  blocker. Line breaks and comma placement are not.
- max_wind_deductible: a wind/hurricane deductible ABOVE their cap is a blocker.
- min_liability: liability below their minimum is a blocker.
- flood_required: if the documents show the property in a flood zone (Zone A or
  V, any SFHA reference) and no flood coverage appears, that's a blocker.

When "closingDate" is supplied and the EOI's effective date falls AFTER it,
that's a blocker — the closing date may have moved after the policy was issued.

Rules that matter more than finding something:
- Report a discrepancy ONLY when both documents clearly show a value AND those
  values genuinely conflict. If either side is absent or unreadable, list the
  field under "unchecked" instead. Never guess.
- These are NOT discrepancies: capitalization, punctuation, abbreviations
  ("St"/"Street", "Ave"/"Avenue", "N"/"North"), suffix formatting, middle
  initials present on one side, extra whitespace, date formatting, ZIP+4 vs
  5-digit ZIP, or a trailing "LLC"/"Inc" difference in a company name.
- A missing middle name is not a finding. A missing ENTIRE PERSON is.
- severity: "blocker" for anything that will cause the lender to reject the
  policy or delay funding (wrong mortgagee, wrong address, missing co-borrower,
  coverage effective after closing, wrong loan number). "warning" for things
  worth a look that won't stop the closing.

Respond with ONLY a JSON object (no fences):
{
  "findings": [
    {"severity": "blocker"|"warning", "field": string, "issue": string,
     "on_agent_doc": string|null, "on_lender_doc": string|null, "fix": string}
  ],
  "checked": [string],
  "unchecked": [string]
}
"issue" is one plain sentence an agent can act on. "fix" is the concrete
correction, e.g. "Re-issue the EOI with mortgagee: Summit Lending ISAOA/ATIMA,
PO Box 12, Richmond VA 23220".`;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, coborrower_name, property_address, closing_date, partners(name, requirements)")
    .eq("id", params.id)
    .single();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });
  // The clause that applies to THIS file — what the processor designated, or
  // what the matcher picked, or the partner's default. Checking an EOI against
  // a partner's single saved clause was wrong the moment a shop had more than
  // one investor.
  const applicable = await clauseForReferral(referral.id);
  const baseReq = (referral as any).partners?.requirements ?? null;
  const requirements =
    applicable.text || baseReq
      ? { ...(baseReq ?? {}), mortgagee_clause: applicable.text ?? baseReq?.mortgagee_clause ?? null }
      : null;

  const { data: docs } = await db()
    .from("documents")
    .select("id, kind, file_name, storage_path, uploaded_by, purged_at, created_at")
    .eq("referral_id", params.id)
    .is("purged_at", null)
    .order("created_at", { ascending: false });

  const usable = (docs ?? []).filter((d) => d.storage_path && mediaTypeFor(d.file_name));
  const lenderDocs = usable.filter((d) => LENDER_KINDS.includes(d.kind)).slice(0, 3);
  const agentDocs = usable.filter((d) => AGENT_KINDS.includes(d.kind)).slice(0, 3);

  if (agentDocs.length === 0) {
    return NextResponse.json(
      { error: "Upload the EOI (and RCE) first — there's nothing to check yet." },
      { status: 400 }
    );
  }
  // With this partner's requirements on file, a check is still worth running
  // even when no lender document was uploaded for this particular deal.
  if (lenderDocs.length === 0 && !requirements) {
    return NextResponse.json(
      {
        error:
          "Nothing to check against yet. Either upload what your partner sent (loan application, insurance request, mortgagee clause), or save their requirements once in the partner's Edit panel and every future EOI gets checked automatically.",
      },
      { status: 400 }
    );
  }

  // Build the content payload: each document labeled by side and kind.
  const content: any[] = [];
  for (const d of [...lenderDocs, ...agentDocs].slice(0, MAX_DOCS)) {
    const side = LENDER_KINDS.includes(d.kind) ? "LENDER DOCUMENT" : "AGENT DOCUMENT";
    const { data: blob } = await db().storage.from(DOCS_BUCKET).download(d.storage_path!);
    if (!blob || blob.size > MAX_BYTES) continue;
    const media = mediaTypeFor(d.file_name)!;
    const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    content.push({ type: "text", text: `--- ${side}: ${DOC_KINDS[d.kind] ?? d.kind} (${d.file_name}) ---` });
    content.push(
      media === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: media, data: b64 } }
        : { type: "image", source: { type: "base64", media_type: media, data: b64 } }
    );
  }
  if (content.length === 0) {
    return NextResponse.json({ error: "Couldn't read those files (too large or unsupported)." }, { status: 400 });
  }

  // What ReferBound already knows — helps catch a co-borrower the agent
  // recorded but the policy omits.
  content.push({
    type: "text",
    text: `On file in ReferBound: ${JSON.stringify({
      client_name: referral.client_name,
      coborrower_name: referral.coborrower_name,
      property_address: referral.property_address,
      closingDate: referral.closing_date,
      lenderRequirements: requirements,
    })}`,
  });

  let parsed: any;
  try {
    const raw = await askClaude({ system: SYSTEM, content, maxTokens: 1600 });
    parsed = parseJsonLoose(raw);
  } catch (e: any) {
    return NextResponse.json({ error: `Check failed: ${e.message}` }, { status: 502 });
  }

  const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 12) : [];
  const blockers = findings.filter((f: any) => f.severity === "blocker").length;
  const result = {
    findings,
    checked: Array.isArray(parsed.checked) ? parsed.checked : [],
    unchecked: Array.isArray(parsed.unchecked) ? parsed.unchecked : [],
    blockers,
    warnings: findings.length - blockers,
    comparedAgainst: [
      ...lenderDocs.map((d) => DOC_KINDS[d.kind] ?? d.kind),
      ...(requirements ? [`${(referral as any).partners?.name ?? "the partner"}'s saved requirements`] : []),
    ],
    checkedDocs: agentDocs.map((d) => DOC_KINDS[d.kind] ?? d.kind),
    at: new Date().toISOString(),
  };

  await db().from("referrals").update({ doc_check: result }).eq("id", params.id);
  await logActivity(
    params.id,
    "document_uploaded",
    findings.length === 0
      ? `Pre-delivery check passed — ${result.checkedDocs.join(", ")} matched the lender's documents`
      : `Pre-delivery check found ${blockers} blocker${blockers === 1 ? "" : "s"} and ${result.warnings} warning${
          result.warnings === 1 ? "" : "s"
        }`,
    "system"
  );

  return NextResponse.json(result);
}
