import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { askClaude, parseJsonLoose } from "@/lib/ai";

// Public (token-guarded): draft the partner's warm introduction email
// connecting their client with the agent. If the partner has saved a template,
// the AI preserves its structure and voice and only swaps client details.

const SYSTEM = `You draft warm introduction emails that a referral partner (a loan
officer, realtor, CPA, or friend) sends to connect their client with an insurance
agent.

Hard rules:
- Use ONLY the supplied facts. Never invent loan amounts, addresses, dates,
  coverage details, or anything not provided.
- If a TEMPLATE is supplied: preserve its structure, tone, and wording as closely
  as possible — only replace client-specific and deal-specific details with the
  new client's data. It is the partner's preferred pattern; respect it.
- If no template: write a short, warm, professional intro (3-5 sentences).
  Address the client by first name, introduce the agent by name and agency,
  explain the agent will take care of their insurance, and encourage them to
  reply-all or expect the agent's call.
- Plain text only. No markdown, no placeholders like [NAME] — if a detail is
  missing, write around it naturally.
- Never disparage or discourage phone calls, texts, or personal contact —
  encourage the client and agent to connect however they prefer.

Respond with ONLY a JSON object (no fences):
{"subject": string, "body": string}`;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { data: partner } = await db()
    .from("partners")
    .select("id, name, intro_template, account_id")
    .eq("token", params.token)
    .single();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const referralId = String(body?.referral_id ?? "");
  if (!referralId) return NextResponse.json({ error: "referral_id is required" }, { status: 400 });

  const { data: referral } = await db()
    .from("referrals")
    .select("id, client_name, client_email, property_address, closing_date")
    .eq("id", referralId)
    .eq("partner_id", partner.id)
    .single();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ data: prof }, { data: ownerAccount }] = await Promise.all([
    db()
      .from("agent_profile")
      .select("display_name, agency_name, phone, email")
      .eq("account_id", (partner as any).account_id)
      .maybeSingle(),
    db().from("accounts").select("email").eq("id", (partner as any).account_id).maybeSingle(),
  ]);

  const agentName = prof?.display_name || "your insurance agent";
  const agencyName = prof?.agency_name || prof?.display_name || "their agency";
  const agentEmail = prof?.email || ownerAccount?.email || "";
  const clientFirst = referral.client_name.split(" ")[0];

  const facts = {
    partnerName: partner.name,
    clientName: referral.client_name,
    propertyAddress: referral.property_address,
    closingDate: referral.closing_date,
    agentName,
    agencyName,
    agentPhone: prof?.phone ?? null,
    agentEmail: agentEmail || null,
    template: partner.intro_template ?? null,
  };

  let subject: string;
  let emailBody: string;
  try {
    const raw = await askClaude({
      system: SYSTEM,
      content: [{ type: "text", text: JSON.stringify(facts) }],
      maxTokens: 600,
    });
    const parsed = parseJsonLoose(raw);
    subject = String(parsed.subject ?? "").trim();
    emailBody = String(parsed.body ?? "").trim();
    if (!subject || !emailBody) throw new Error("empty draft");
  } catch {
    // AI unavailable (no key / no credits / outage) — fall back to a clean
    // deterministic intro so the feature still works.
    subject = `Intro: ${referral.client_name} + ${agentName} — home insurance`;
    emailBody = `Hi ${clientFirst},\n\nI'd like to introduce you to ${agentName} with ${agencyName} — they're my go-to for insurance and will take great care of you${
      referral.property_address ? ` on ${referral.property_address}` : ""
    }.\n\n${agentName.split(" ")[0]}, meet ${referral.client_name}. I'll let you two take it from here.\n\nThanks!\n${partner.name}`;
  }

  return NextResponse.json({
    subject,
    body: emailBody,
    agentEmail,
    clientEmail: referral.client_email ?? null,
    hasTemplate: !!partner.intro_template,
  });
}
