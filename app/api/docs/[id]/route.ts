import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { DOC_KINDS } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getAccount } from "@/lib/account";

// Agent-only: remove a document that went up by mistake (wrong file, wrong
// deal). Deletes the storage object and the row; the partner portal stops
// showing it immediately. Any email already sent about it can't be recalled —
// the UI says so before confirming.

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc } = await db()
    .from("documents")
    .select("id, kind, file_name, storage_path, referral_id, referrals(account_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc || (doc as any).referrals?.account_id !== account.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Best-effort storage cleanup first; the row is the source of truth, so a
  // storage hiccup shouldn't leave a ghost entry the partner can still see.
  if (doc.storage_path) {
    await db().storage.from(DOCS_BUCKET).remove([doc.storage_path]);
  }

  const { error } = await db().from("documents").delete().eq("id", doc.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    doc.referral_id,
    "document_deleted",
    `${DOC_KINDS[doc.kind] ?? doc.kind} removed (${doc.file_name})`,
    "agent"
  );

  return NextResponse.json({ ok: true });
}
