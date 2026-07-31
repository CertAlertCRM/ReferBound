import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { askClaude, parseJsonLoose } from "@/lib/ai";
import { STOCK_TEMPLATES, TEMPLATE_META, validateTemplate, type NotifyTemplates } from "@/lib/voice";

export const dynamic = "force-dynamic";

// "Your voice" — AI studies how the agent actually writes (their real messages
// to partners) and drafts every partner notification in that voice. Nothing is
// used until the agent reviews and saves it; reset returns to stock wording.

const SYSTEM = `You study how an insurance agent writes and produce notification
templates in THEIR voice, for their referral partners (loan officers, realtors).

You receive the agent's real messages to partners (may be few or none), their
name and agency. Respond with ONLY a JSON object (no fences):
{"voice_notes": string, "email_quoted": string, "email_docs": string,
 "sms_quoted": string, "sms_docs": string, "email_recap_intro": string,
 "email_thankyou": string}

Rules:
- voice_notes: 2-3 sentences describing their tone so future drafts stay
  consistent (e.g. "Short and upbeat, first names, one exclamation max...").
- Templates must sound like the agent: mirror their warmth, formality, typical
  phrasing and sign-off style. Use emoji ONLY if their own messages do.
- If there are few or no samples, default to warm and personal — like a good
  agent texting a colleague they like. Never corporate, never stiff.
- Placeholders, exactly as written: {{client}} (client's name), {{partner}}
  (partner company), {{first}} (recipient's first name — may render empty, so
  never make the sentence depend on it), {{link}} (portal link), and in
  email_docs only: {{docs}} (list of document names).
- email_quoted / email_docs: 2-4 sentences, plain text, MUST include {{client}},
  and MUST end with {{link}} on its own line.
- sms_quoted / sms_docs: under 240 characters, MUST include {{client}} and
  {{link}}, and MUST end with "Reply STOP to opt out".
- email_recap_intro: ONE warm sentence (two max) that opens the monthly
  summary, above the stats. May use {{partner}}, {{month}}, {{agent}}. No
  numbers — the stats block below it carries those.
- email_thankyou: 3-5 sentences, MUST include {{partner}} and sign off with
  {{agent}}. May use {{period}} ("this past month/quarter"). STRICTLY
  metric-free: no counts, percentages, or dollar amounts — it is appreciation,
  never a scoreboard.
- Facts only. Never promise speed, outcomes, or savings. Documents are ready
  AFTER the policy is bound and the agent uploads them — never "instantly" or
  "the moment it's bound".
- Never frame anything as replacing or reducing calls, texts, or personal
  contact — the portal is an addition to however the partner likes to work.`;

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: prof } = await db()
    .from("agent_profile")
    .select("voice_notes, notify_templates")
    .eq("account_id", account.id)
    .maybeSingle();
  return NextResponse.json({
    voiceNotes: prof?.voice_notes ?? null,
    templates: (prof?.notify_templates as NotifyTemplates) ?? null,
    stock: STOCK_TEMPLATES,
  });
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { data: existing } = await db()
    .from("agent_profile")
    .select("id, display_name, agency_name")
    .eq("account_id", account.id)
    .maybeSingle();
  const rowId = existing?.id ?? account.id;

  // ── Reset to stock ─────────────────────────────────────────────────────────
  if (body.action === "reset") {
    await db()
      .from("agent_profile")
      .upsert({ id: rowId, account_id: account.id, voice_notes: null, notify_templates: null, updated_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  // ── Save (after the agent reviewed/edited) ────────────────────────────────
  if (body.action === "save") {
    const t = body.templates ?? {};
    const clean: NotifyTemplates = {};
    for (const key of Object.keys(TEMPLATE_META) as (keyof NotifyTemplates)[]) {
      const text = String(t[key] ?? "").trim();
      if (!text) continue;
      const err = validateTemplate(key, text);
      if (err) return NextResponse.json({ error: `${TEMPLATE_META[key].label}: ${err}` }, { status: 400 });
      clean[key] = text.slice(0, 1500);
    }
    await db().from("agent_profile").upsert({
      id: rowId,
      account_id: account.id,
      voice_notes: String(body.voiceNotes ?? "").trim().slice(0, 1000) || null,
      notify_templates: Object.keys(clean).length ? clean : null,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  }

  // ── Learn: read their real writing, draft in their voice ──────────────────
  // Their outbound portal messages are the best sample of how they talk to
  // partners. Capped and stripped to text only.
  const { data: msgs } = await db()
    .from("messages")
    .select("body, referrals!inner(account_id)")
    .eq("referrals.account_id", account.id)
    .eq("sender", "agent")
    .order("created_at", { ascending: false })
    .limit(20);
  const samples = (msgs ?? []).map((m: any) => String(m.body)).filter(Boolean).slice(0, 20);

  const facts = {
    agentName: existing?.display_name || "the agent",
    agencyName: existing?.agency_name || null,
    writingSamples: samples,
  };

  try {
    const raw = await askClaude({
      system: SYSTEM,
      content: [{ type: "text", text: JSON.stringify(facts) }],
      maxTokens: 1300,
    });
    const parsed = parseJsonLoose(raw);
    const drafts: NotifyTemplates = {};
    for (const key of Object.keys(TEMPLATE_META) as (keyof NotifyTemplates)[]) {
      const text = String(parsed[key] ?? "").trim();
      // A draft that fails validation falls back to stock so the agent always
      // has something safe to edit.
      drafts[key] = text && !validateTemplate(key, text) ? text : STOCK_TEMPLATES[key];
    }
    return NextResponse.json({
      voiceNotes: String(parsed.voice_notes ?? "").trim() || null,
      templates: drafts,
      sampleCount: samples.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't draft right now — try again in a minute, or edit the stock wording directly." },
      { status: 502 }
    );
  }
}
