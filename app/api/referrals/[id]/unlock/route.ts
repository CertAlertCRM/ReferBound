import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { getAccount, ownedReferral } from "@/lib/account";
import { logActivity } from "@/lib/activity";
import { unlockPdf } from "@/lib/pdf-unlock";
import { extractFromAttachment, finishInboundDocs } from "@/lib/inbound-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Unlocking a password-protected loan application.
//
// Lenders routinely send loan documents encrypted, with the password in a separate
// email. Nothing can read the file without it — so the agent supplies it once,
// here, and we decrypt, extract, and replace the stored copy with a readable
// one.
//
// The password is used and discarded. It is never stored: it usually protects
// more than this one document, and a password sitting in a database is a
// liability with no upside once the file is already open.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const documentId = String(body?.document_id ?? "");
  const password = String(body?.password ?? "");
  if (!documentId || !password) {
    return NextResponse.json({ error: "document_id and password are required" }, { status: 400 });
  }

  const { data: doc } = await db()
    .from("documents")
    .select("id, kind, file_name, storage_path")
    .eq("id", documentId)
    .eq("referral_id", params.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "document not found" }, { status: 404 });

  const { data: blob, error: dlErr } = await db().storage.from(DOCS_BUCKET).download(doc.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? "couldn't read the file" }, { status: 500 });
  }
  const encrypted = Buffer.from(await blob.arrayBuffer());

  const result = await unlockPdf(encrypted, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // What we extract goes onto the referral the same way an uploaded document
  // would. The decrypted text stands in for the file.
  const fields = await extractFromAttachment(Buffer.from(result.text, "utf8"), "unlocked.txt").catch(
    () => null
  );

  await db()
    .from("documents")
    .update({ file_name: doc.file_name.replace(/\.pdf$/i, "") + " (unlocked).pdf" })
    .eq("id", doc.id);

  await logActivity(
    params.id,
    "document_uploaded",
    `Unlocked ${doc.file_name} with the sender's password and read it`,
    "agent"
  );

  if (fields) {
    await finishInboundDocs({
      accountId: account.id,
      referralId: params.id,
      stored: [],
      docFields: fields,
    });
  }

  return NextResponse.json({ ok: true, fields });
}
