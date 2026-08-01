import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { makeDemoToken } from "@/lib/demo";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// The agent's sample-portal link, minted on first ask and stable after that —
// so a link already sitting in a loan officer's inbox keeps working.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: acct } = await db()
    .from("accounts")
    .select("demo_token")
    .eq("id", account.id)
    .maybeSingle();

  let token = acct?.demo_token ?? null;
  if (!token) {
    for (let i = 0; i < 5 && !token; i++) {
      const candidate = makeDemoToken();
      const { error } = await db().from("accounts").update({ demo_token: candidate }).eq("id", account.id);
      if (!error) token = candidate;
    }
  }
  if (!token) return NextResponse.json({ error: "couldn't create a link" }, { status: 500 });

  return NextResponse.json({ url: `${appUrl()}/demo/${token}` });
}
