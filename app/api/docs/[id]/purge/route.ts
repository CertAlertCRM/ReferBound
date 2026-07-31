import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { DOC_KINDS } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

// Data minimization, one click: delete the SOURCE FILE from storage while
// keeping the document row and everything extracted from it. Used after AI
// reads a loan application — the agent keeps the client details they need to
// quote, and the file carrying the borrower's full financial picture stops
// existing. Deliberately NOT a blur or a redaction overlay: hidden text under
// a black box is still readable text, and pretending otherwise is worse than
// keeping the file honestly.

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc } = await db()
    .from("documents")
    .select("id, kind, file_name, storage_path, purged_at, referral_id, referrals(account_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc || (doc as any).referrals?.account_id !== account.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (doc.purged_at) return NextResponse.json({ ok: true, alreadyPurged: true });

  if (doc.storage_path) {
    const { error } = await db().storage.from(DOCS_BUCKET).remove([doc.storage_path]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await db()
    .from("documents")
    .update({ purged_at: new Date().toISOString(), storage_path: null })
    .eq("id", doc.id);

  await logActivity(
    doc.referral_id,
    "document_deleted",
    `Source file removed for privacy (${DOC_KINDS[doc.kind] ?? doc.kind} — ${doc.file_name}). Extracted details kept.`,
    "agent"
  );

  return NextResponse.json({ ok: true });
}
