import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOC_KINDS_PARTNER } from "@/lib/config";
import { sendEmail, plainBodyEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/helpers";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/ratelimit";
import { EMAIL_RE, normalizeEmail } from "@/lib/format";

export const dynamic = "force-dynamic";

// Public (portal-token guarded): send a deal's insurance documents to whoever
// on the partner's side actually needs them — a processor, an underwriter, the
// closing desk. At a good agency the LO isn't the one assembling the file, so
// making them the courier is friction nobody needed.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  if (!(await rateLimit(`send-docs:${clientIp(req)}`, 20, 3600))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const { data: partner } = await db()
    .from("partners")
    .select("id, name, token, account_id")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const to = normalizeEmail(body?.to);
  const referralId = String(body?.referralId ?? "");
  const note = String(body?.note ?? "").trim().slice(0, 400);
  if (!to || !EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (!referralId) return NextResponse.json({ error: "referralId required" }, { status: 400 });

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, property_address, partner_id, documents(id, kind, file_name, purged_at)")
    .eq("id", referralId)
    .eq("partner_id", partner.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const docs = (referral.documents ?? []).filter((d: any) => !d.purged_at);
  if (docs.length === 0) {
    return NextResponse.json({ error: "No documents on this file yet" }, { status: 400 });
  }

  // Links carry the partner's own portal token — the same access the sender
  // already has, forwarded to a colleague at their own company.
  const lines = docs
    .map(
      (d: any) =>
        `${DOC_KINDS_PARTNER[d.kind] ?? d.kind}: ${appUrl()}/api/docs/${d.id}/download?t=${partner.token}`
    )
    .join("\n");

  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name")
    .eq("account_id", partner.account_id)
    .maybeSingle();
  const agency = prof?.agency_name || prof?.display_name || "the insurance agency";

  const result = await sendEmail({
    referralId: referral.id,
    kind: "docs_ready",
    to: [to],
    subject: `Insurance documents — ${referral.client_name}`,
    html: plainBodyEmail(
      `Insurance documents for ${referral.client_name}${
        referral.property_address ? ` (${referral.property_address})` : ""
      }, from ${agency}:\n\n${lines}\n\n${note ? `${note}\n\n` : ""}` +
        `Live status for this file and everything else in flight: ${appUrl()}/p/${partner.token}`
    ),
  });
  if (!result.sent) {
    return NextResponse.json({ error: `Couldn't send (${result.error ?? "unknown"})` }, { status: 502 });
  }

  await logActivity(referral.id, "email_sent", `${partner.name} forwarded the documents to ${to}`, "partner");
  return NextResponse.json({ ok: true });
}
