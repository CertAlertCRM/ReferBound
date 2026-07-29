import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

// Read / save the account's outbound webhook URL (the Zapier bridge).

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await db()
    .from("accounts")
    .select("webhook_url, thankyou_cadence")
    .eq("id", account.id)
    .maybeSingle();
  return NextResponse.json({
    webhook_url: data?.webhook_url ?? "",
    thankyou_cadence: data?.thankyou_cadence ?? "off",
  });
}

export async function PUT(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};

  if (body && "webhook_url" in body) {
    const url = String(body.webhook_url ?? "").trim();
    if (url && !/^https:\/\/.+\..+/i.test(url)) {
      return NextResponse.json(
        { error: "That doesn't look like a URL — it should start with https://" },
        { status: 400 }
      );
    }
    patch.webhook_url = url || null;
  }

  if (body && "thankyou_cadence" in body) {
    const cadence = String(body.thankyou_cadence ?? "off");
    if (!["off", "monthly", "quarterly"].includes(cadence)) {
      return NextResponse.json({ error: "invalid cadence" }, { status: 400 });
    }
    patch.thankyou_cadence = cadence;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { error } = await db().from("accounts").update(patch).eq("id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
