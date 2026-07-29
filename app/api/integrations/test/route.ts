import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { sendTestWebhook } from "@/lib/webhook";

export const dynamic = "force-dynamic";

// "Send test" — fires a sample referral payload at the given URL so the agent
// can watch it arrive in Zapier's "Catch Hook" step before wiring field maps.

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const url = String(body?.webhook_url ?? "").trim();
  if (!/^https:\/\/.+\..+/i.test(url)) {
    return NextResponse.json({ error: "Enter an https:// webhook URL first." }, { status: 400 });
  }
  const result = await sendTestWebhook(url);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ? `Couldn't reach it (${result.error}).` : `The endpoint answered ${result.status}.` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
}
