import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, plainBodyEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// The expiring-policy watch. When a policy renews and the lender never gets an
// updated EOI, the servicer force-places coverage — three times the price, a
// furious client, and an agent who "didn't do anything wrong" except not send
// a document nobody asked for. This catches it 30 days out.
//
// Emails the AGENT, never the partner: the agent has to issue the renewal EOI
// before there's anything to deliver.
//
// Guarded by CRON_SECRET: GET /api/cron/renewals?secret=...

const WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (secret && auth !== `Bearer ${secret}` && qs !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  // Documents with a policy expiration inside the window.
  const { data: docs } = await db()
    .from("documents")
    .select("id, kind, effective_end, referral_id, referrals(id, account_id, client_name, renewal_notified_at, status, partners(name))")
    .in("kind", ["eoi", "dec"])
    .not("effective_end", "is", null)
    .gte("effective_end", today)
    .lte("effective_end", horizon);

  // One row per referral, earliest expiration wins.
  const byReferral = new Map<string, { name: string; partner: string; expires: string; accountId: string }>();
  for (const d of docs ?? []) {
    const r = (d as any).referrals;
    if (!r?.account_id) continue;
    if (!["bound", "docs_delivered"].includes(r.status)) continue;
    // Already nudged within the last 60 days? Stay quiet.
    if (r.renewal_notified_at && Date.now() - new Date(r.renewal_notified_at).getTime() < 60 * 86400000) continue;
    const existing = byReferral.get(r.id);
    if (!existing || d.effective_end! < existing.expires) {
      byReferral.set(r.id, {
        name: r.client_name,
        partner: r.partners?.name ?? "their partner",
        expires: d.effective_end!,
        accountId: r.account_id,
      });
    }
  }
  if (byReferral.size === 0) return NextResponse.json({ notified: 0 });

  // Group by account, respecting each agent's opt-out.
  const accountIds = Array.from(new Set(Array.from(byReferral.values()).map((v) => v.accountId)));
  const { data: profiles } = await db()
    .from("agent_profile")
    .select("account_id, display_name, renewal_watch")
    .in("account_id", accountIds);
  const profByAccount = new Map((profiles ?? []).map((p) => [p.account_id, p]));
  const { data: accounts } = await db().from("accounts").select("id, email").in("id", accountIds);
  const emailByAccount = new Map((accounts ?? []).map((a) => [a.id, a.email]));

  let notified = 0;
  for (const accountId of accountIds) {
    const prof = profByAccount.get(accountId);
    if (prof && prof.renewal_watch === false) continue;
    const to = emailByAccount.get(accountId);
    if (!to) continue;

    const items = Array.from(byReferral.entries()).filter(([, v]) => v.accountId === accountId);
    if (!items.length) continue;

    const lines = items
      .map(([, v]) => `• ${v.name} — expires ${v.expires} (${v.partner})`)
      .join("\n");

    const result = await sendEmail({
      kind: "at_risk",
      to: [to],
      subject: `${items.length} polic${items.length === 1 ? "y" : "ies"} renewing soon — send updated proof of coverage`,
      html: plainBodyEmail(
        `These policies expire within the next ${WINDOW_DAYS} days:\n\n${lines}\n\n` +
          `If the lender doesn't receive updated evidence of insurance before the renewal date, ` +
          `the servicer can force-place coverage — expensive for the client and awkward for everyone.\n\n` +
          `Upload the renewal EOI to each deal and mark it delivered; their portal updates and the ` +
          `partner gets the new document automatically.\n\n${appUrl()}`
      ),
    });
    if (result.sent) {
      notified++;
      for (const [refId] of items) {
        await db().from("referrals").update({ renewal_notified_at: new Date().toISOString() }).eq("id", refId);
      }
    }
  }

  return NextResponse.json({ notified, deals: byReferral.size });
}
