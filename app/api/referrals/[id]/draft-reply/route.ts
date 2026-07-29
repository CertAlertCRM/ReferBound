import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { askClaude } from "@/lib/ai";
import { STATUS_LABELS } from "@/lib/config";
import { getAccount, ownedReferral } from "@/lib/account";

// Agent-only (protected by middleware): draft a short partner update grounded
// ONLY in this referral's real data. The agent reviews/edits before sending.

const SYSTEM = `You draft short, professional-warm status updates from an insurance
agent to their lending-partner contact about a shared client.

Hard rules:
- Use ONLY the facts supplied. Never invent quotes, prices, coverage details,
  carrier names, dates, or promises that aren't in the supplied data.
- 1–3 sentences, conversational but professional. No greeting line, no signature.
- If the partner asked a question you don't have the facts to answer, acknowledge
  it and say the agent will follow up with specifics — do not make up an answer.
- Respond with ONLY the message text. No quotes around it, no commentary.`;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedReferral(account.id, params.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const [{ data: referral }, { data: msgs }, { data: activity }, { data: prof }] = await Promise.all([
    db()
      .from("referrals")
      .select("client_name, status, closing_date, property_address, notes, partners(name)")
      .eq("id", params.id)
      .single(),
    db()
      .from("messages")
      .select("sender, body, created_at")
      .eq("referral_id", params.id)
      .order("created_at", { ascending: false })
      .limit(6),
    db()
      .from("activity_log")
      .select("detail, created_at")
      .eq("referral_id", params.id)
      .order("created_at", { ascending: false })
      .limit(6),
    db().from("agent_profile").select("display_name").eq("account_id", account.id).maybeSingle(),
  ]);

  if (!referral) return NextResponse.json({ error: "referral not found" }, { status: 404 });

  const facts = {
    client: referral.client_name,
    currentStatus: STATUS_LABELS[referral.status] ?? referral.status,
    closingDate: referral.closing_date,
    propertyAddress: referral.property_address,
    agentName: prof?.display_name || "the agent",
    partnerName: (referral as any).partners?.name,
    recentMessagesNewestFirst: (msgs ?? []).map((m) => `${m.sender}: ${m.body}`),
    recentActivityNewestFirst: (activity ?? []).map((a) => a.detail),
    agentNotes: referral.notes,
  };

  try {
    const draft = await askClaude({
      system: SYSTEM,
      content: [{ type: "text", text: JSON.stringify(facts) }],
      maxTokens: 300,
    });
    return NextResponse.json({ draft: draft.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
