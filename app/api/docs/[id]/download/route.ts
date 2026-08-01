import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { verifyDocSig } from "@/lib/doclink";

// Public route guarded three ways: the partner token (?t=...) for partners, a
// signed-in account that OWNS the referral for agents, or a per-document
// expiring signature (?e=&s=) for a client who was emailed their own paperwork
// and has no account to sign into.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.nextUrl.searchParams.get("t");

  const { data: doc, error } = await db()
    .from("documents")
    .select("id, storage_path, file_name, referrals(account_id, partners(token))")
    .eq("id", params.id)
    .single();
  if (error || !doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const partnerToken = (doc as any).referrals?.partners?.token;
  const ownerAccountId = (doc as any).referrals?.account_id;

  const tokenOk = !!token && !!partnerToken && token === partnerToken;
  const linkOk = verifyDocSig(
    params.id,
    req.nextUrl.searchParams.get("e"),
    req.nextUrl.searchParams.get("s")
  );
  const sessionAccountId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const agentOk = !!sessionAccountId && sessionAccountId === ownerAccountId;

  if (!tokenOk && !agentOk && !linkOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: signed, error: signErr } = await db()
    .storage.from(DOCS_BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 10, { download: doc.file_name });
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? "sign failed" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
