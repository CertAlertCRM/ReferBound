import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { agentProfile, ownProfileRow, profileKey, splitProfileEdits } from "@/lib/profile";
import { THEMES } from "@/lib/themes";

// Agent-only (protected by middleware): read/update the agent's profile.

export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The agency's letterhead with THIS person's name on it. For an owner or a
  // solo agent that is exactly the row it always was.
  const profile = await agentProfile(account);

  let headshotUrl: string | null = null;
  if (profile?.headshot_path) {
    const { data: signed } = await db()
      .storage.from(DOCS_BUCKET)
      .createSignedUrl(profile.headshot_path, 60 * 60);
    headshotUrl = signed?.signedUrl ?? null;
  }
  return NextResponse.json({
    profile: profile ?? null,
    headshotUrl,
    // The profile page uses these to show agency fields as read-only rather
    // than letting a producer type into something that will be refused.
    isTeamMember: account.isTeamMember,
    ownerEmail: account.ownerEmail,
  });
}

export async function PUT(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // Profile rows are keyed by account: id mirrors the account uuid for new
  // accounts; the claimed legacy row keeps id 'default' but carries account_id.
  // A producer writes to their OWN row. Before this, every field below was
  // written to `account_id = account.id` — the owner's row — so a teammate
  // saving their name silently replaced the agency owner's.
  const { allowed: body2, refused } = splitProfileEdits(account, body as Record<string, unknown>);
  const existing = await ownProfileRow(account);
  const key = profileKey(account);
  const rowId = existing?.id ?? key;
  const row: Record<string, unknown> = { id: rowId, account_id: key, updated_at: new Date().toISOString() };
  for (const f of ["display_name", "agency_name", "office", "phone", "email", "google_review_url"]) {
    if (f in body2) row[f] = String(body2[f] ?? "").trim() || null;
  }
  if ("sms_new_lead" in body2) row.sms_new_lead = Boolean(body2.sms_new_lead);
  if ("show_scorecard" in body2) row.show_scorecard = Boolean(body2.show_scorecard);
  if ("renewal_watch" in body2) row.renewal_watch = Boolean(body2.renewal_watch);
  if ("inbox_autocreate" in body2) row.inbox_autocreate = Boolean(body2.inbox_autocreate);
  if ("inbox_autoack" in body2) row.inbox_autoack = Boolean(body2.inbox_autoack);
  if ("doc_retention_days" in body2) {
    const n = Number(body2.doc_retention_days);
    row.doc_retention_days = [0, 30, 90, 180].includes(n) ? n : 0;
  }
  if ("brand_color" in body2 && THEMES[String(body2.brand_color)]) {
    row.brand_color = String(body2.brand_color);
  }

  const { data, error } = await db().from("agent_profile").upsert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Read it back the same way it will be read everywhere else, so a producer
  // sees the merged result — their name on the agency's letterhead — rather
  // than the bare row they just wrote.
  const merged = await agentProfile(account);
  return NextResponse.json({
    profile: merged ?? data,
    // Named plainly rather than swallowed. If a producer's client sends a
    // field they can't change, they should be told which, not left wondering
    // why it didn't stick.
    refused,
  });
}
