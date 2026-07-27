import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { sessionToken } from "@/lib/auth";

// Public route guarded by the partner token (?t=...) or valid agent cookie
// (middleware lets it through; we re-check here).

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.nextUrl.searchParams.get("t");

  const { data: doc, error } = await db()
    .from("documents")
    .select("id, storage_path, file_name, referrals(partner_id, partners(token))")
    .eq("id", params.id)
    .single();
  if (error || !doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const partnerToken = (doc as any).referrals?.partners?.token;
  const agentCookie = req.cookies.get("rl_agent")?.value;
  const tokenOk = token && partnerToken && token === partnerToken;
  const agentOk = !!agentCookie && agentCookie === sessionToken();
  if (!tokenOk && !agentOk) {
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
