import { db } from "@/lib/db";
import type { Account } from "@/lib/account";

// Who the signed-in person is, versus what agency they work for.
//
// The bug this exists to end: agent_profile has always been read with
// `.eq("account_id", account.id)`, and on an agency plan account.id is the
// OWNER's id for every producer on the team. So a producer signed in as
// themselves saw the owner's name, the owner's photo, the owner's phone
// number and the owner's email — and saving their own profile wrote over the
// owner's row. From the producer's side the product looked like somebody
// else's account, because every piece of identity on the screen was.
//
// The split:
//
//   PERSONAL — who is speaking. Their name, their phone, their email, their
//   face. These belong to the individual and are read from, and written to,
//   their own row.
//
//   AGENCY — what letterhead they speak on. Agency name, office, review link,
//   brand colour, retention and inbox settings, and the voice templates.
//   These stay the owner's, for everyone, deliberately: an agency's review
//   link is the agency's, and a producer should not be able to point it
//   somewhere else.
//
// A producer who has filled nothing in still gets their own name, because the
// accounts row already has it from signup. Nobody has to visit a settings page
// to stop being shown as their boss.

export const PERSONAL_FIELDS = ["display_name", "phone", "email", "headshot_path"] as const;

// Everything a team member is shown but may not change. Kept explicit rather
// than "anything not personal" so a new column has to be classified on
// purpose instead of silently becoming editable by seven people.
export const AGENCY_FIELDS = [
  "agency_name",
  "office",
  "google_review_url",
  "brand_color",
  "doc_retention_days",
  "inbox_autocreate",
  "inbox_autoack",
  "renewal_watch",
  "show_scorecard",
  "sms_new_lead",
  "notify_templates",
] as const;

// The row this person's own edits belong in. For an owner or a solo agent
// selfId IS account.id, so this changes nothing for them — including the
// legacy row that still carries id 'default'.
export function profileKey(account: Account): string {
  return account.selfId;
}

export async function ownProfileRow(account: Account) {
  const { data } = await db()
    .from("agent_profile")
    .select("*")
    .eq("account_id", profileKey(account))
    .maybeSingle();
  return data as any;
}

// The merged view: the agency's letterhead with this person's name on it.
//
// Two reads for a team member, one for everybody else. Worth the extra round
// trip — this is what the greeting, every email signature and every draft is
// built from, and getting it wrong is what made a producer think she was
// inside her manager's account.
export async function agentProfile(account: Account): Promise<any | null> {
  const { data: agency } = await db()
    .from("agent_profile")
    .select("*")
    .eq("account_id", account.id)
    .maybeSingle();

  if (!account.isTeamMember) return agency;

  const own = await ownProfileRow(account);
  const merged: any = { ...(agency ?? {}) };

  // Name falls back to the accounts row, which signup already filled in, so a
  // producer who has never opened Profile still sees themselves.
  merged.display_name = own?.display_name || account.display_name || null;
  // Their login address is the honest default for a signature — the owner's
  // is never right for mail a producer is sending.
  merged.email = own?.email || account.email || null;
  merged.phone = own?.phone || null;
  // Never inherited. A producer showing the owner's face to a client is the
  // most visible version of this whole bug.
  merged.headshot_path = own?.headshot_path ?? null;

  return merged;
}

// Split an incoming profile PATCH into what this person may write and what
// they may not. Owners get everything; the second array is what to tell a
// producer was left alone.
export function splitProfileEdits(
  account: Account,
  body: Record<string, unknown>
): { allowed: Record<string, unknown>; refused: string[] } {
  if (!account.isTeamMember) return { allowed: body, refused: [] };
  const allowed: Record<string, unknown> = {};
  const refused: string[] = [];
  for (const key of Object.keys(body)) {
    if ((PERSONAL_FIELDS as readonly string[]).includes(key)) allowed[key] = body[key];
    else if ((AGENCY_FIELDS as readonly string[]).includes(key)) refused.push(key);
    // Anything unrecognised is dropped silently — the PUT handler only reads
    // fields it knows anyway.
  }
  return { allowed, refused };
}
