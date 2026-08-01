import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendEmail, plainBodyEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { appUrl } from "@/lib/helpers";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/ratelimit";
import { fireWebhook } from "@/lib/webhook";

export const dynamic = "force-dynamic";

// The closing moved.
//
// The processor knows first, and until now had no way to say so short of
// picking up the phone. One control on their side of the portal, and the
// agent's board is accurate again — which matters most for the deals where the
// date moved EARLIER, because that's a file that just quietly became urgent.

function isoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // A closing more than two years out is a typo, not a date.
  if (d.getTime() > Date.now() + 730 * 86400000) return null;
  return s;
}

function fmt(d: string | null): string {
  if (!d) return "no date";
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!(await rateLimit(`closing-date:${clientIp(req)}`, 60, 3600))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const slug = params.token.replace(/[^a-zA-Z0-9]/g, "");
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, account_id, token")
    .or(`token.eq.${slug},short_code.eq.${slug}`)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const referralId = String(body?.referral_id ?? "");
  const next = isoDate(body?.closing_date);
  const who = String(body?.by ?? "").trim().slice(0, 120) || null;
  const note = String(body?.note ?? "").trim().slice(0, 300) || null;
  if (!referralId) return NextResponse.json({ error: "referral_id required" }, { status: 400 });
  if (!next) return NextResponse.json({ error: "That date doesn't look right" }, { status: 400 });

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, closing_date, status, property_address")
    .eq("id", referralId)
    .eq("partner_id", partner.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const previous = referral.closing_date ?? null;
  if (previous === next) return NextResponse.json({ ok: true, unchanged: true });

  await db()
    .from("referrals")
    .update({
      closing_date: next,
      closing_date_was: previous,
      closing_date_changed_at: new Date().toISOString(),
    })
    .eq("id", referral.id);

  const moved = previous
    ? new Date(`${next}T12:00:00`).getTime() < new Date(`${previous}T12:00:00`).getTime()
      ? "moved up"
      : "pushed back"
    : "set";

  await logActivity(
    referral.id,
    "closing_date_changed",
    `${who ? `${who} at ${partner.name}` : partner.name} ${moved} the closing: ${fmt(previous)} → ${fmt(next)}${
      note ? ` — ${note}` : ""
    }`,
    "partner"
  );

  await fireWebhook(partner.account_id, "referral.status_changed", { ...referral, closing_date: next }, partner as any);

  // Tell the agent. A closing that moved UP is the whole reason this exists —
  // it's a file that just became urgent without anyone touching it.
  const urgent = moved === "moved up";
  const { data: account } = await db()
    .from("accounts")
    .select("email")
    .eq("id", partner.account_id)
    .maybeSingle();
  const { data: prof } = await db()
    .from("agent_profile")
    .select("phone, sms_new_lead")
    .eq("account_id", partner.account_id)
    .maybeSingle();

  const line =
    `${partner.name}${who ? ` (${who})` : ""} ${moved} the closing on ${referral.client_name}` +
    `${referral.property_address ? ` — ${referral.property_address}` : ""}.\n\n` +
    `Was ${fmt(previous)}, now ${fmt(next)}.${note ? `\n\nThey added: “${note}”` : ""}\n\n` +
    `${appUrl()}/deal/${referral.id}`;

  if (account?.email) {
    await sendEmail({
      referralId: referral.id,
      kind: "status_update",
      to: [account.email],
      subject: `${urgent ? "Closing moved up" : "Closing moved"} — ${referral.client_name} now ${fmt(next)}`,
      html: plainBodyEmail(line),
    });
  }

  // A date that moved earlier is worth a buzz on the same opt-in they already
  // gave for new leads. A date pushed back can wait for email.
  if (urgent && prof?.sms_new_lead && prof?.phone) {
    await sendSms({
      referralId: referral.id,
      kind: "closing_moved",
      to: prof.phone,
      body: `ReferBound: ${partner.name} moved ${referral.client_name}'s closing UP to ${fmt(next)} (was ${fmt(previous)}). ${appUrl()}/deal/${referral.id}`,
    });
  }

  return NextResponse.json({ ok: true, closing_date: next, moved });
}
