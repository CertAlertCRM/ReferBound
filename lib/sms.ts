import { db } from "./db";

// SMS via Twilio's REST API (raw fetch, no SDK — same pattern as our AI
// calls). Best-effort and strictly opt-in: if Twilio isn't configured or the
// recipient hasn't opted in, nothing sends and nothing breaks.

export function toE164(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms({
  referralId,
  kind,
  to,
  body,
}: {
  referralId?: string;
  kind: string;
  to: string | null | undefined;
  body: string;
}): Promise<{ sent: boolean; error: string | null }> {
  const recipient = toE164(to);
  const log = {
    referral_id: referralId ?? null,
    kind,
    recipient: recipient ?? String(to ?? ""),
    body: body.slice(0, 500),
    sent: false,
    error: null as string | null,
  };

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!recipient) {
    log.error = "invalid phone number";
  } else if (!sid || !token || !from) {
    log.error = "sms not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM missing)";
  } else {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: recipient, From: from, Body: body }).toString(),
      });
      if (res.ok) {
        log.sent = true;
      } else {
        const err = await res.json().catch(() => ({}));
        log.error = String((err as any)?.message ?? `twilio ${res.status}`);
      }
    } catch (e: any) {
      log.error = String(e?.message ?? e);
    }
  }

  await db().from("sms_log").insert(log);
  return { sent: log.sent, error: log.error };
}
