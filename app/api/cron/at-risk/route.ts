import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AT_RISK_DAYS, SAFE_STATUSES } from "@/lib/config";
import { sendEmail, atRiskEmail } from "@/lib/email";
import { appUrl, fmtDate } from "@/lib/helpers";
import { logActivity } from "@/lib/activity";

// Daily check: any referral closing within AT_RISK_DAYS that isn't bound yet
// triggers one alert email to the agent + partner (deduped to one per day).
// Wire this to Vercel Cron (vercel.json) or hit it manually. Guarded by CRON_SECRET.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (secret && auth !== `Bearer ${secret}` && qs !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + AT_RISK_DAYS * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: atRisk, error } = await db()
    .from("referrals")
    .select("id, client_name, closing_date, status, partners(name, token, emails)")
    .not("closing_date", "is", null)
    .gte("closing_date", iso(today))
    .lte("closing_date", iso(horizon))
    .not("status", "in", `(${[...SAFE_STATUSES, "lost"].join(",")})`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const since = new Date(today).toISOString();
  let sent = 0;

  for (const r of atRisk ?? []) {
    // dedupe: skip if an at_risk email for this referral already went out today
    const { data: existing } = await db()
      .from("email_log")
      .select("id")
      .eq("referral_id", r.id)
      .eq("kind", "at_risk")
      .gte("created_at", since)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const partner = (r as any).partners;
    const portalUrl = `${appUrl()}/p/${partner?.token}`;
    const recipients = [
      ...(partner?.emails ?? []),
      ...(process.env.AGENT_EMAIL ? [process.env.AGENT_EMAIL] : []),
    ];
    await sendEmail({
      referralId: r.id,
      kind: "at_risk",
      to: recipients,
      subject: `⚠ ${r.client_name} closes ${fmtDate(r.closing_date)} — insurance not bound`,
      html: atRiskEmail(r.client_name, fmtDate(r.closing_date), r.status, portalUrl),
    });
    await logActivity(
      r.id,
      "at_risk_flagged",
      `Flagged at-risk: closes ${fmtDate(r.closing_date)}, not yet bound`,
      "system"
    );
    sent++;
  }

  return NextResponse.json({ checked: atRisk?.length ?? 0, alerted: sent });
}
