import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, ownedReferral } from "@/lib/account";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// "I already asked."
//
// The ask that actually works in this business happens out loud — at the desk
// when they sign, or on the phone when you tell them they're covered. Before
// this endpoint the only way to stamp asked_at was to send an email, which
// meant a producer doing it the right way showed up in ReferBound as somebody
// who never asks, and their queue never drained. That is a good producer being
// punished by the software for being good at the job.
//
// So: no email, no template, no recipient. Just the record that it happened,
// which is all the queue and the earned-share number ever needed.

type Kind = "referral" | "review" | "crosssell";

const COLUMN: Record<Kind, string> = {
  referral: "asked_at",
  review: "review_asked_at",
  // The round-out. Same reasoning as the referral ask: it happens out loud,
  // on the phone, and a producer who does it the right way should not look to
  // this product like somebody who never did it.
  crosssell: "xsell_asked_at",
};

const HOW_LABEL: Record<string, string> = {
  in_person: "in person",
  phone: "by phone",
  text: "by text",
  other: "",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const owned = await ownedReferral(account.id, params.id, "id, client_name");
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const kind: Kind =
    body?.kind === "review" ? "review" : body?.kind === "crosssell" ? "crosssell" : "referral";
  const how = String(body?.how ?? "in_person");
  const clear = body?.clear === true;

  const col = COLUMN[kind];
  const { error } = await db()
    .from("referrals")
    .update({ [col]: clear ? null : new Date().toISOString() })
    .eq("id", params.id)
    .eq("account_id", account.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const what = kind === "review" ? "review" : kind === "crosssell" ? "round-out" : "referral";
  const suffix = HOW_LABEL[how] ? ` ${HOW_LABEL[how]}` : "";
  await logActivity(
    params.id,
    clear ? "ask_cleared" : "ask_recorded",
    clear
      ? `Unmarked the ${what} ask`
      : kind === "crosssell"
        ? `Talked to ${owned.client_name} about rounding out the household${suffix}`
        : `Asked ${owned.client_name} for a ${what}${suffix}`,
    "agent"
  );

  return NextResponse.json({ ok: true, cleared: clear });
}
