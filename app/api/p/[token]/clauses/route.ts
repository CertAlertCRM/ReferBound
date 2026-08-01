import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { parseClauseList, parseRequirements } from "@/lib/clauses";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/ratelimit";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The processor's clause library, from their side of the portal.
//
// Token-guarded like the rest of the partner surface. A processor uploads the
// sheet they already keep — spreadsheet, PDF, screenshot, or a paste — and gets
// a reviewed library out of it. Nothing saves until they've looked at it,
// because a mortgagee clause is rejected at closing over one wrong word and an
// unreviewed AI transcription is not something to bet a closing on.

async function partnerFor(token: string) {
  const slug = token.replace(/[^a-zA-Z0-9]/g, "");
  const { data } = await db()
    .from("partners")
    .select("id, name, account_id")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const partner = await partnerFor(params.token);
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ data: clauses }, { data: files }] = await Promise.all([
    db()
      .from("mortgagee_clauses")
      .select("id, label, clause, investor, loan_types, notes, is_default, created_at")
      .eq("partner_id", partner.id)
      .order("is_default", { ascending: false })
      .order("label", { ascending: true }),
    db()
      .from("partner_files")
      .select("id, kind, file_name, parsed, created_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({ clauses: clauses ?? [], files: files ?? [] });
}

// Parse an upload or a paste. Returns candidates for review — saves nothing.
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const partner = await partnerFor(params.token);
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await rateLimit(`clause-parse:${clientIp(req)}`, 20, 3600))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const text = String(form?.get("text") ?? "");
  const kind = String(form?.get("kind") ?? "clause_list");

  if (!file && !text.trim()) {
    return NextResponse.json({ error: "Attach a file or paste your list" }, { status: 400 });
  }
  if (file && file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (15MB max)" }, { status: 400 });
  }

  let filePayload: { base64: string; fileName: string } | null = null;
  if (file) {
    const buf = Buffer.from(await file.arrayBuffer());
    filePayload = { base64: buf.toString("base64"), fileName: file.name };
  }

  try {
    if (kind === "requirements") {
      const parsed = await parseRequirements({ text, file: filePayload });
      if (!parsed) return NextResponse.json({ error: "Couldn't read that" }, { status: 422 });

      // Requirements save straight through — they're advisory to the check, not
      // wording that has to be character-exact.
      let storagePath: string | null = null;
      if (file) {
        const path = `partners/${partner.id}/requirements-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await db()
          .storage.from(DOCS_BUCKET)
          .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || undefined });
        if (!error) storagePath = path;
      }
      await db().from("partner_files").insert({
        partner_id: partner.id,
        kind: "requirements",
        file_name: file?.name ?? "Pasted requirements",
        storage_path: storagePath,
        parsed,
        uploaded_by: "partner",
      });

      // Merge into the partner record the cross-check already reads.
      const { data: p } = await db().from("partners").select("requirements").eq("id", partner.id).maybeSingle();
      await db()
        .from("partners")
        .update({ requirements: { ...((p?.requirements as any) ?? {}), ...parsed } })
        .eq("id", partner.id);

      return NextResponse.json({ requirements: parsed, saved: true });
    }

    const clauses = await parseClauseList({ text, file: filePayload });
    if (clauses.length === 0) {
      return NextResponse.json(
        { error: "Couldn't find any mortgagee clauses in that — try a clearer copy, or paste the text." },
        { status: 422 }
      );
    }
    return NextResponse.json({ candidates: clauses });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}

// Commit a reviewed library.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const partner = await partnerFor(params.token);
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  if (body?.action === "delete" && body?.id) {
    await db().from("mortgagee_clauses").delete().eq("id", String(body.id)).eq("partner_id", partner.id);
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "default" && body?.id) {
    // One default per partner — the unique index enforces it, so clear first.
    await db().from("mortgagee_clauses").update({ is_default: false }).eq("partner_id", partner.id);
    await db()
      .from("mortgagee_clauses")
      .update({ is_default: true })
      .eq("id", String(body.id))
      .eq("partner_id", partner.id);
    return NextResponse.json({ ok: true });
  }

  const rows: any[] = Array.isArray(body?.clauses) ? body.clauses : [];
  if (rows.length === 0) return NextResponse.json({ error: "nothing to save" }, { status: 400 });
  if (rows.length > 100) return NextResponse.json({ error: "100 clauses max at a time" }, { status: 400 });

  const { count } = await db()
    .from("mortgagee_clauses")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id);
  const isFirstBatch = (count ?? 0) === 0;

  const inserts = rows
    .map((r, i) => ({
      partner_id: partner.id,
      label: String(r.label ?? "").trim().slice(0, 120),
      clause: String(r.clause ?? "").trim().slice(0, 1200),
      investor: String(r.investor ?? "").trim() || null,
      loan_types: Array.isArray(r.loan_types) ? r.loan_types.map((t: any) => String(t)).slice(0, 8) : [],
      notes: String(r.notes ?? "").trim() || null,
      // First one in on an empty library becomes the default, so a file always
      // has something to fall back to.
      is_default: isFirstBatch && i === 0,
      source: String(r.source ?? "import"),
    }))
    .filter((r) => r.label && r.clause.length > 10);

  if (inserts.length === 0) return NextResponse.json({ error: "nothing usable to save" }, { status: 400 });

  const { data, error } = await db().from("mortgagee_clauses").insert(inserts).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: data?.length ?? 0 });
}
