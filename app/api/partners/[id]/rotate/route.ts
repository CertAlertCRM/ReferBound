import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// Rotate a partner's magic link. Every previously shared link (long and
// short) stops working immediately — the safety valve for a link that leaked
// beyond the partner's team.

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const newToken = randomBytes(32).toString("hex");
  const newShort = randomBytes(9).toString("hex").slice(0, 12);

  const { data, error } = await db()
    .from("partners")
    .update({ token: newToken, short_code: newShort })
    .eq("id", params.id)
    .eq("account_id", account.id)
    .select("id, name, token, short_code")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, token: data.token, short_code: data.short_code });
}
