import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeEmail, EMAIL_RE } from "@/lib/format";
import { sendEmail, hubLinkEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";

// A partner asks for their aggregated board. We NEVER confirm whether the
// email is known, and the board link only travels to the email itself —
// that's the ownership proof.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  // Only mint boards for emails that actually appear on at least one partner.
  const { data: partnerHit } = await db()
    .from("partners")
    .select("id")
    .contains("emails", [email])
    .limit(1);

  if (partnerHit && partnerHit.length > 0) {
    // Throttle: one link email per address per 10 minutes.
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    const { data: recent } = await db()
      .from("email_log")
      .select("id")
      .eq("kind", "hub_link")
      .contains("recipients", [email])
      .gte("created_at", tenMinAgo)
      .limit(1);

    if (!recent || recent.length === 0) {
      let { data: hub } = await db().from("lender_hubs").select("token").eq("email", email).maybeSingle();
      if (!hub) {
        const { data: created } = await db()
          .from("lender_hubs")
          .insert({ email })
          .select("token")
          .single();
        hub = created;
      }
      if (hub) {
        await sendEmail({
          kind: "hub_link",
          to: [email],
          subject: "Your referral board — all your agents, one page",
          html: hubLinkEmail(`${appUrl()}/hub/${hub.token}`),
        });
      }
    }
  }

  // Same answer either way — no email enumeration.
  return NextResponse.json({ ok: true });
}
