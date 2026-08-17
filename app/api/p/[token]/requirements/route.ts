import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseRequirements } from "@/lib/clauses";
import { normalizeRequirements, requirementLines } from "@/lib/requirements";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The lender's own insurance requirements, maintained from their side.
//
// This used to live only on the agent's partner page, which meant an agent
// typing from memory what a processor enforces for a living. When the investor
// changes or a cap moves, the agent is the last to know and the first to send
// an EOI that comes back. Now the people who own the rule own the record.
//
// Token-guarded like the rest of the partner surface. Two ways in: type it, or
// upload the requirements sheet the lender already publishes and have it read.
// Either way it saves through one normalizer, so the pre-delivery check reads a
// single predictable shape.

async function partnerFor(token: string) {
  const slug = token.replace(/[^a-zA-Z0-9]/g, "");
  const { data } = await db()
    .from("partners")
    .select("id, name, account_id, requirements")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const partner = await partnerFor(params.token);
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    requirements: normalizeRequirements(partner.requirements),
    partnerName: partner.name,
  });
}

// Save what they typed. The whole object is replaced, because a requirements
// sheet is a statement of the current rule, not a running list of edits.
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const partner = await partnerFor(params.token);
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await rateLimit(`req-put:${clientIp(req)}`, 30, 60);
  if (!ok) return NextResponse.json(RATE_LIMITED, { status: 429 });

  const body = await req.json().catch(() => null);
  const by = String(body?.by ?? "").trim().slice(0, 120) || null;
  const clean = normalizeRequirements(body?.requirements, { source: "partner", by });

  const { error } = await db()
    .from("partners")
    .update({ requirements: clean })
    .eq("id", partner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requirements: clean, saved: true });
}

// Read a requirements sheet and return the parsed values for REVIEW. Nothing
// is saved here — the partner confirms first. A requirement transcribed wrong
// is worse than one that's missing, because the agent will trust it.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const partner = await partnerFor(params.token);
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await rateLimit(`req-parse:${clientIp(req)}`, 8, 60);
  if (!ok) return NextResponse.json(RATE_LIMITED, { status: 429 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const text = String(form.get("text") ?? "").trim() || null;
  const file = form.get("file") as File | null;

  let parsed = null;
  try {
    parsed = await parseRequirements({
      text,
      file: file
        ? {
            base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
            fileName: file.name,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't read that: ${e.message}` }, { status: 502 });
  }
  if (!parsed) {
    return NextResponse.json({ error: "Nothing readable in that — try pasting the text." }, { status: 400 });
  }

  // Returned for review only. Merged over whatever's already saved so a sheet
  // covering three rules doesn't silently erase a fourth they typed by hand.
  const existing = normalizeRequirements(partner.requirements) ?? {};
  const merged = normalizeRequirements({ ...existing, ...parsed });
  return NextResponse.json({ requirements: merged, lines: requirementLines(merged), review: true });
}
