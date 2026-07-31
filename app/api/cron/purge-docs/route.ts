import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { SENSITIVE_DOC_KINDS } from "@/lib/config";

export const dynamic = "force-dynamic";

// Scheduled data minimization. For every agent who set a retention window,
// delete the SOURCE FILES of sensitive documents (loan applications) older
// than that window. Extracted details on the referral are never touched, and
// documents the agent delivers (EOI, RCE, dec pages) are never purged —
// partners need to download those.
//
// Guarded by CRON_SECRET; safe to run manually:
//   GET /api/cron/purge-docs?secret=...

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (secret && auth !== `Bearer ${secret}` && qs !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profiles } = await db()
    .from("agent_profile")
    .select("account_id, doc_retention_days")
    .gt("doc_retention_days", 0);
  if (!profiles?.length) return NextResponse.json({ purged: 0, accounts: 0 });

  let purged = 0;
  for (const p of profiles) {
    if (!p.account_id) continue;
    const cutoff = new Date(Date.now() - p.doc_retention_days * 86400000).toISOString();

    const { data: docs } = await db()
      .from("documents")
      .select("id, storage_path, created_at, referrals!inner(account_id)")
      .eq("referrals.account_id", p.account_id)
      .in("kind", SENSITIVE_DOC_KINDS)
      .is("purged_at", null)
      .lt("created_at", cutoff)
      .limit(500);

    for (const d of docs ?? []) {
      if (d.storage_path) {
        await db().storage.from(DOCS_BUCKET).remove([d.storage_path]);
      }
      await db()
        .from("documents")
        .update({ purged_at: new Date().toISOString(), storage_path: null })
        .eq("id", d.id);
      purged++;
    }
  }

  return NextResponse.json({ purged, accounts: profiles.length });
}
