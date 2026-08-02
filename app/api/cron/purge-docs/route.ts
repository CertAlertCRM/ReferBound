import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { SENSITIVE_DOC_KINDS } from "@/lib/config";
import { Budget, cronGuard, cronReport } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduled data minimization. For every agent who set a retention window,
// delete the SOURCE FILES of sensitive documents (loan applications) older
// than that window. Extracted details on the referral are never touched, and
// documents the agent delivers (EOI, RCE, dec pages) are never purged —
// partners need to download those.
//
// Storage is the line item that grows without anyone deciding to spend more,
// so a purge that quietly ran out of time is a bill nobody sees coming. The
// deletes are batched per account and the run reports what it didn't reach.
//
// Guarded by CRON_SECRET; safe to run manually:
//   GET /api/cron/purge-docs?secret=...

export async function GET(req: NextRequest) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const budget = new Budget(240);
  const { data: profiles } = await db()
    .from("agent_profile")
    .select("account_id, doc_retention_days")
    .gt("doc_retention_days", 0);
  if (!profiles?.length) return NextResponse.json(cronReport("purge-docs", { purged: 0, accounts: 0 }));

  let purged = 0;
  let failed = 0;
  let skipped = 0;

  for (const p of profiles as any[]) {
    if (!p.account_id) continue;
    if (budget.expired) {
      skipped++;
      continue;
    }
    const cutoff = new Date(Date.now() - p.doc_retention_days * 86400000).toISOString();

    const { data: docs } = await db()
      .from("documents")
      .select("id, storage_path, created_at, referrals!inner(account_id)")
      .eq("referrals.account_id", p.account_id)
      .in("kind", SENSITIVE_DOC_KINDS)
      .is("purged_at", null)
      .lt("created_at", cutoff)
      .limit(500);
    if (!docs?.length) continue;

    // Storage takes a list, so one call removes the whole account's batch.
    const paths = (docs as any[]).map((d) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error } = await db().storage.from(DOCS_BUCKET).remove(paths);
      if (error) {
        // The row stays unpurged and the next run tries again — better than
        // marking a file gone that's still sitting in the bucket costing money.
        console.error(`[cron:purge-docs] storage remove failed for ${p.account_id}:`, error.message);
        failed += paths.length;
        continue;
      }
    }

    const ids = (docs as any[]).map((d) => d.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db()
        .from("documents")
        .update({ purged_at: new Date().toISOString(), storage_path: null })
        .in("id", ids.slice(i, i + 200));
      if (error) console.error("[cron:purge-docs] mark purged failed:", error.message);
    }
    purged += ids.length;
  }

  return NextResponse.json(
    cronReport("purge-docs", {
      purged,
      failed,
      skipped,
      accounts: profiles.length,
      secondsLeft: budget.secondsLeft,
    })
  );
}
