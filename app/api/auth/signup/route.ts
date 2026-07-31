import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken, sessionCookie } from "@/lib/session";
import { normalizeEmail, EMAIL_RE } from "@/lib/format";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { TEAM_SEAT_LIMIT } from "@/lib/account";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/ratelimit";
import { grantProMonths, WELCOME_MONTHS } from "@/lib/referral";

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`signup-ip:${clientIp(req)}`, 6, 3600))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");
  const displayName = String(body?.display_name ?? "").trim() || null;
  const inviteCode = String(body?.invite_code ?? "").trim();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: existing } = await db().from("accounts").select("id").eq("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists — sign in instead" }, { status: 409 });
  }

  // Team invite: joining an Agency-plan account's shared book.
  let teamOwnerId: string | null = null;
  if (inviteCode) {
    const { data: invite } = await db()
      .from("team_invites")
      .select("account_id")
      .eq("code", inviteCode)
      .maybeSingle();
    if (!invite) {
      return NextResponse.json(
        { error: "That invite link is no longer valid — ask your agency owner for a fresh one." },
        { status: 400 }
      );
    }
    const { data: owner } = await db()
      .from("accounts")
      .select("id, plan")
      .eq("id", invite.account_id)
      .maybeSingle();
    if (!owner || owner.plan !== "agency") {
      return NextResponse.json(
        { error: "This team isn't on the Agency plan right now — ask your agency owner to check billing." },
        { status: 403 }
      );
    }
    const { count } = await db()
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("team_owner_id", owner.id);
    if ((count ?? 0) + 1 >= TEAM_SEAT_LIMIT) {
      return NextResponse.json(
        { error: `This agency has reached its ${TEAM_SEAT_LIMIT}-user limit.` },
        { status: 403 }
      );
    }
    teamOwnerId = owner.id;
  }

  // Referral attribution — who sent them. Captured here or never: this is not
  // reconstructable after the fact.
  let referredBy: string | null = null;
  const refCode = String(body?.ref ?? "").trim().toLowerCase();
  if (refCode && !teamOwnerId) {
    const { data: referrer } = await db()
      .from("accounts")
      .select("id")
      .eq("referral_code", refCode)
      .maybeSingle();
    if (referrer) referredBy = referrer.id;
  }

  const { data: account, error } = await db()
    .from("accounts")
    .insert({
      email,
      password_hash: hashPassword(password),
      display_name: displayName,
      team_owner_id: teamOwnerId,
      referred_by: referredBy,
    })
    .select("id, email")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Referred agents start with a Pro window so they can stand up three or four
  // partners immediately instead of one — the referral doubles as activation.
  if (referredBy) await grantProMonths(account.id, WELCOME_MONTHS);

  if (!teamOwnerId) {
    // Pilot-data claim: rows created before accounts existed have no owner.
    // The founding agent (AGENT_EMAIL) adopts them on first signup.
    if (process.env.AGENT_EMAIL && email === process.env.AGENT_EMAIL.toLowerCase()) {
      await db().from("partners").update({ account_id: account.id }).is("account_id", null);
      await db().from("referrals").update({ account_id: account.id }).is("account_id", null);
      const { data: legacyProfile } = await db()
        .from("agent_profile")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (legacyProfile) {
        await db()
          .from("agent_profile")
          .update({ account_id: account.id })
          .eq("id", "default")
          .is("account_id", null);
      }
    }

    // Every solo/owner account gets a profile row keyed by account_id (team
    // members share the owner's profile instead).
    const { data: prof } = await db()
      .from("agent_profile")
      .select("id")
      .eq("account_id", account.id)
      .maybeSingle();
    if (!prof) {
      await db().from("agent_profile").insert({
        id: account.id,
        account_id: account.id,
        display_name: displayName,
        email,
      });
    }
  }

  // Welcome email — best-effort, never blocks signup.
  await sendEmail({
    kind: "welcome",
    to: [email],
    subject: teamOwnerId ? "You've joined your agency's team on ReferBound" : "Welcome to ReferBound — your first partner in 3 steps",
    html: welcomeEmail(displayName, appUrl(), Boolean(teamOwnerId)),
  });

  const res = NextResponse.json({ ok: true, teamMember: Boolean(teamOwnerId) });
  res.cookies.set(sessionCookie(createSessionToken(account.id)));
  return res;
}
