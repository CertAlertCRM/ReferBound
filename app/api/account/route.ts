import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Self-serve account deletion. The user types their email to confirm; we
// clean up storage best-effort, then delete the account row — the account_id
// foreign keys cascade partners, referrals, documents, messages, and events.

export async function DELETE(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const confirm = String(body?.confirm ?? "").trim().toLowerCase();
  if (confirm !== account.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Type your account email exactly to confirm deletion." },
      { status: 400 }
    );
  }

  // Agency owners must disband the team first — deleting the owner would
  // otherwise take every teammate's login down with it (FK cascade).
  if (!account.isTeamMember) {
    const { count } = await db()
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("team_owner_id", account.selfId);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Remove your team members on the billing page first, then delete your account." },
        { status: 400 }
      );
    }
  }

  // Team members own no shared data — just their login row.
  if (!account.isTeamMember) {
    // Best-effort storage cleanup: documents, partner logos, headshot.
    try {
      const paths: string[] = [];
      const { data: docs } = await db()
        .from("documents")
        .select("storage_path, referrals!inner(account_id)")
        .eq("referrals.account_id", account.id)
        .limit(1000);
      for (const d of docs ?? []) if (d.storage_path) paths.push(d.storage_path);

      const { data: partners } = await db()
        .from("partners")
        .select("logo_path")
        .eq("account_id", account.id);
      for (const p of partners ?? []) if (p.logo_path) paths.push(p.logo_path);

      const { data: prof } = await db()
        .from("agent_profile")
        .select("headshot_path")
        .eq("account_id", account.id)
        .maybeSingle();
      if (prof?.headshot_path) paths.push(prof.headshot_path);

      for (let i = 0; i < paths.length; i += 100) {
        await db().storage.from(DOCS_BUCKET).remove(paths.slice(i, i + 100));
      }
    } catch {
      // Orphaned storage objects are acceptable; the data rows are what matter.
    }

    await db().from("agent_profile").delete().eq("account_id", account.id);
  }

  const { error } = await db().from("accounts").delete().eq("id", account.selfId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
