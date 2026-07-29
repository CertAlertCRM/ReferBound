import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { askClaude, parseJsonLoose } from "@/lib/ai";
import { sendEmail, plainBodyEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// The answer to "does an email go out when I copy the link?" — now the agent
// can SEND the link: AI drafts a warm invitation introducing the portal, the
// agent edits, then sends from ReferBound (or opens it in their own mail app).

const SYSTEM = `You draft a short, warm email from an insurance agent to a referral
partner (a loan officer, realtor, CPA, or friend), introducing their new live
referral portal and sharing its link.

Hard rules:
- Use ONLY the supplied facts. No invented claims, statistics, or promises.
- Explain plainly what the portal does: live status on every client they refer,
  documents the moment policies are bound, no login needed — just the link.
- Encourage them to bookmark it and send their next referral through it.
- Include the portal link on its own line.
- Warm, professional, brief (5-8 sentences). Plain text only, no markdown.
- Sign off with the agent's name.

Respond with ONLY a JSON object (no fences): {"subject": string, "body": string}`;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: partner } = await db()
    .from("partners")
    .select("id, name, partner_type, emails, token, short_code")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "not found" }, { status: 404 });

  const link = `${appUrl()}/p/${partner.short_code || partner.token}`;
  const body = await req.json().catch(() => ({}));

  // ── Send the (edited) draft ────────────────────────────────────────────────
  if (body?.action === "send") {
    const subject = String(body.subject ?? "").trim().slice(0, 200);
    const text = String(body.body ?? "").trim().slice(0, 5000);
    if (!subject || !text) return NextResponse.json({ error: "subject and body required" }, { status: 400 });
    if (!partner.emails || partner.emails.length === 0) {
      return NextResponse.json({ error: "This partner has no notification emails yet — add one first." }, { status: 400 });
    }
    const result = await sendEmail({
      kind: "portal_invite",
      to: partner.emails,
      subject,
      html: plainBodyEmail(text),
    });
    if (!result.sent) {
      return NextResponse.json({ error: `Couldn't send (${result.error ?? "unknown"})` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: partner.emails });
  }

  // ── Draft ──────────────────────────────────────────────────────────────────
  const { data: prof } = await db()
    .from("agent_profile")
    .select("display_name, agency_name, phone")
    .eq("account_id", account.id)
    .maybeSingle();
  const agentName = prof?.display_name || "your agent";
  const agencyName = prof?.agency_name || prof?.display_name || "our agency";

  const facts = {
    partnerName: partner.name,
    partnerType: partner.partner_type,
    agentName,
    agencyName,
    agentPhone: prof?.phone ?? null,
    portalLink: link,
  };

  let subject: string;
  let draft: string;
  try {
    const raw = await askClaude({
      system: SYSTEM,
      content: [{ type: "text", text: JSON.stringify(facts) }],
      maxTokens: 600,
    });
    const parsed = parseJsonLoose(raw);
    subject = String(parsed.subject ?? "").trim();
    draft = String(parsed.body ?? "").trim();
    if (!subject || !draft) throw new Error("empty");
  } catch {
    subject = `Your live referral portal with ${agencyName}`;
    draft = `Hi ${partner.name} team,\n\nI set up a live portal for the clients you send my way — real-time status on every referral, and documents the moment policies are bound. No login, no password; this link is all you need:\n\n${link}\n\nBookmark it, and feel free to send your next referral straight through it — takes about 30 seconds.\n\nThanks for the partnership,\n${agentName}`;
  }

  return NextResponse.json({ subject, body: draft, link, recipients: partner.emails ?? [] });
}
